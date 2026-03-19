import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.permissions import require_permission
from app.models.agent_conversation import AgentConversation, AgentMessage
from app.models.user import User
from app.schemas.agent import ConversationCreate, ConversationOut, MessageCreate, MessageOut
from app.schemas.auth import UserInfo

router = APIRouter(prefix="/api/agents", tags=["agents"])


async def _get_user_id(db: AsyncSession, current_user: UserInfo) -> uuid.UUID:
    """Look up the DB user id from the OIDC subject."""
    result = await db.execute(select(User).where(User.oidc_subject == current_user.sub))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user.id


@router.get("/conversations", response_model=list[ConversationOut])
async def list_conversations(
    current_user: UserInfo = Depends(require_permission("agents", "view")),
    db: AsyncSession = Depends(get_db),
):
    """List current user's agent conversations."""
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(AgentConversation)
        .where(AgentConversation.user_id == user_id)
        .order_by(AgentConversation.updated_at.desc())
    )
    return result.scalars().all()


@router.get("/{agent_name}/conversations", response_model=list[ConversationOut])
async def list_agent_conversations(
    agent_name: str,
    current_user: UserInfo = Depends(require_permission("agents", "view")),
    db: AsyncSession = Depends(get_db),
):
    """List current user's conversations for a specific agent."""
    user_id = await _get_user_id(db, current_user)
    result = await db.execute(
        select(AgentConversation)
        .where(
            AgentConversation.user_id == user_id,
            AgentConversation.agent_name == agent_name,
        )
        .order_by(AgentConversation.updated_at.desc())
    )
    return result.scalars().all()


@router.post("/{agent_name}/conversations", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
async def create_agent_conversation(
    agent_name: str,
    data: ConversationCreate,
    current_user: UserInfo = Depends(require_permission("agents", "create")),
    db: AsyncSession = Depends(get_db),
):
    """Start a new conversation with a specific agent."""
    user_id = await _get_user_id(db, current_user)
    conversation = AgentConversation(
        user_id=user_id,
        agent_name=agent_name,
        **data.model_dump(exclude={"agent_name"}),
    )
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    return conversation


@router.post("/conversations", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    data: ConversationCreate,
    current_user: UserInfo = Depends(require_permission("agents", "create")),
    db: AsyncSession = Depends(get_db),
):
    """Start a new agent conversation."""
    user_id = await _get_user_id(db, current_user)

    conversation = AgentConversation(user_id=user_id, **data.model_dump())
    db.add(conversation)
    await db.commit()
    await db.refresh(conversation)
    return conversation


@router.get("/conversations/{conv_id}/messages", response_model=list[MessageOut])
async def get_messages(
    conv_id: uuid.UUID,
    current_user: UserInfo = Depends(require_permission("agents", "view")),
    db: AsyncSession = Depends(get_db),
):
    """Get messages for a conversation."""
    user_id = await _get_user_id(db, current_user)

    # Verify conversation belongs to user
    conv_result = await db.execute(
        select(AgentConversation).where(
            AgentConversation.id == conv_id,
            AgentConversation.user_id == user_id,
        )
    )
    if not conv_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )

    result = await db.execute(
        select(AgentMessage)
        .where(AgentMessage.conversation_id == conv_id)
        .order_by(AgentMessage.created_at.asc())
    )
    return result.scalars().all()


class MessagePairOut(BaseModel):
    user_message: MessageOut
    assistant_message: MessageOut


@router.post("/conversations/{conv_id}/messages", response_model=MessagePairOut, status_code=status.HTTP_201_CREATED)
async def send_message(
    conv_id: uuid.UUID,
    data: MessageCreate,
    current_user: UserInfo = Depends(require_permission("agents", "create")),
    db: AsyncSession = Depends(get_db),
):
    """Send a message to a conversation (placeholder AI response)."""
    user_id = await _get_user_id(db, current_user)

    # Verify conversation belongs to user
    conv_result = await db.execute(
        select(AgentConversation).where(
            AgentConversation.id == conv_id,
            AgentConversation.user_id == user_id,
        )
    )
    conversation = conv_result.scalar_one_or_none()
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found"
        )

    # Save user message
    user_message = AgentMessage(
        conversation_id=conv_id,
        role="user",
        content=data.content,
    )
    db.add(user_message)

    # Placeholder AI response
    ai_message = AgentMessage(
        conversation_id=conv_id,
        role="assistant",
        content=(
            f"[Placeholder] I'm the {conversation.agent_name} agent. "
            f"In production, I will process your message using AI. "
            f"You said: {data.content}"
        ),
    )
    db.add(ai_message)

    await db.commit()
    await db.refresh(user_message)
    await db.refresh(ai_message)
    return MessagePairOut(user_message=user_message, assistant_message=ai_message)

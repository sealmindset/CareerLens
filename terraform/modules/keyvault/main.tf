variable "resource_group_name" { type = string }
variable "location" { type = string }
variable "environment" { type = string }

data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "main" {
  name                       = "careerlens-${var.environment}-kv"
  location                   = var.location
  resource_group_name        = var.resource_group_name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  soft_delete_retention_days = 7
  purge_protection_enabled   = false

  access_policy {
    tenant_id = data.azurerm_client_config.current.tenant_id
    object_id = data.azurerm_client_config.current.object_id

    secret_permissions = [
      "Get", "List", "Set", "Delete",
    ]
  }
}

output "vault_uri" { value = azurerm_key_vault.main.vault_uri }

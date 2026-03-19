"use client";

import { useEffect, useState, useCallback } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import type {
  Profile,
  ProfileSkill,
  ProfileExperience,
  ProfileEducation,
} from "@/lib/types";
import {
  Plus,
  Trash2,
  Pencil,
  Save,
  X,
  Upload,
  Link as LinkIcon,
  Loader2,
} from "lucide-react";

const proficiencyLevels = ["beginner", "intermediate", "advanced", "expert"];
const sourceOptions = ["manual", "resume", "linkedin"];

export default function ProfilePage() {
  const { hasPermission } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [showResumeUpload, setShowResumeUpload] = useState(false);

  // Skill form
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [skillName, setSkillName] = useState("");
  const [skillProficiency, setSkillProficiency] = useState("intermediate");
  const [skillYears, setSkillYears] = useState("");
  const [skillSource, setSkillSource] = useState("manual");

  // Experience form
  const [showExpForm, setShowExpForm] = useState(false);
  const [editingExp, setEditingExp] = useState<ProfileExperience | null>(null);
  const [expCompany, setExpCompany] = useState("");
  const [expTitle, setExpTitle] = useState("");
  const [expDescription, setExpDescription] = useState("");
  const [expStartDate, setExpStartDate] = useState("");
  const [expEndDate, setExpEndDate] = useState("");
  const [expIsCurrent, setExpIsCurrent] = useState(false);

  // Education form
  const [showEduForm, setShowEduForm] = useState(false);
  const [eduInstitution, setEduInstitution] = useState("");
  const [eduDegree, setEduDegree] = useState("");
  const [eduField, setEduField] = useState("");
  const [eduGradDate, setEduGradDate] = useState("");

  const canEdit = hasPermission("profile", "edit");

  const fetchProfile = useCallback(async () => {
    try {
      const data = await apiGet<Profile>("/profile");
      setProfile(data);
      setHeadline(data.headline || "");
      setSummary(data.summary || "");
      setLinkedinUrl(data.linkedin_url || "");
      setResumeText(data.raw_resume_text || "");
    } catch (err) {
      console.error("Failed to load profile:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await apiPut("/profile", {
        headline: headline || null,
        summary: summary || null,
        linkedin_url: linkedinUrl || null,
      });
      await fetchProfile();
    } catch (err) {
      console.error("Failed to save profile:", err);
    } finally {
      setSaving(false);
    }
  };

  const uploadResume = async () => {
    setSaving(true);
    try {
      await apiPost("/profile/resume", { raw_resume_text: resumeText });
      setShowResumeUpload(false);
      await fetchProfile();
    } catch (err) {
      console.error("Failed to upload resume:", err);
    } finally {
      setSaving(false);
    }
  };

  const addSkill = async () => {
    try {
      await apiPost("/profile/skills", {
        skill_name: skillName,
        proficiency_level: skillProficiency,
        years_experience: skillYears ? Number(skillYears) : null,
        source: skillSource,
      });
      setShowSkillForm(false);
      setSkillName("");
      setSkillYears("");
      await fetchProfile();
    } catch (err) {
      console.error("Failed to add skill:", err);
    }
  };

  const deleteSkill = async (id: string) => {
    try {
      await apiDelete(`/profile/skills/${id}`);
      await fetchProfile();
    } catch (err) {
      console.error("Failed to delete skill:", err);
    }
  };

  const resetExpForm = () => {
    setExpCompany("");
    setExpTitle("");
    setExpDescription("");
    setExpStartDate("");
    setExpEndDate("");
    setExpIsCurrent(false);
    setEditingExp(null);
  };

  const openEditExp = (exp: ProfileExperience) => {
    setEditingExp(exp);
    setExpCompany(exp.company);
    setExpTitle(exp.title);
    setExpDescription(exp.description || "");
    setExpStartDate(exp.start_date.slice(0, 10));
    setExpEndDate(exp.end_date ? exp.end_date.slice(0, 10) : "");
    setExpIsCurrent(exp.is_current);
    setShowExpForm(true);
  };

  const saveExperience = async () => {
    const body = {
      company: expCompany,
      title: expTitle,
      description: expDescription || null,
      start_date: expStartDate,
      end_date: expIsCurrent ? null : expEndDate || null,
      is_current: expIsCurrent,
    };
    try {
      if (editingExp) {
        await apiPut(`/profile/experiences/${editingExp.id}`, body);
      } else {
        await apiPost("/profile/experiences", body);
      }
      setShowExpForm(false);
      resetExpForm();
      await fetchProfile();
    } catch (err) {
      console.error("Failed to save experience:", err);
    }
  };

  const deleteExperience = async (id: string) => {
    try {
      await apiDelete(`/profile/experiences/${id}`);
      await fetchProfile();
    } catch (err) {
      console.error("Failed to delete experience:", err);
    }
  };

  const addEducation = async () => {
    try {
      await apiPost("/profile/educations", {
        institution: eduInstitution,
        degree: eduDegree,
        field_of_study: eduField || null,
        graduation_date: eduGradDate || null,
      });
      setShowEduForm(false);
      setEduInstitution("");
      setEduDegree("");
      setEduField("");
      setEduGradDate("");
      await fetchProfile();
    } catch (err) {
      console.error("Failed to add education:", err);
    }
  };

  const deleteEducation = async (id: string) => {
    try {
      await apiDelete(`/profile/educations/${id}`);
      await fetchProfile();
    } catch (err) {
      console.error("Failed to delete education:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--primary)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
          <p style={{ color: "var(--muted-foreground)" }}>
            Manage your professional profile, skills, and experience.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={saveProfile}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Profile
          </button>
        )}
      </div>

      {/* Headline */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
        }}
      >
        <label className="block text-sm font-medium mb-2">Headline</label>
        <input
          type="text"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="e.g. Senior Software Engineer | Full-Stack Developer"
          disabled={!canEdit}
          className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          style={{
            backgroundColor: "var(--background)",
            borderColor: "var(--border)",
          }}
        />
      </div>

      {/* Summary */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
        }}
      >
        <label className="block text-sm font-medium mb-2">Summary</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Write a brief professional summary..."
          rows={4}
          disabled={!canEdit}
          className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 resize-none"
          style={{
            backgroundColor: "var(--background)",
            borderColor: "var(--border)",
          }}
        />
      </div>

      {/* LinkedIn URL */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
        }}
      >
        <label className="block text-sm font-medium mb-2">
          <LinkIcon className="inline h-4 w-4 mr-1" />
          LinkedIn URL
        </label>
        <input
          type="url"
          value={linkedinUrl}
          onChange={(e) => setLinkedinUrl(e.target.value)}
          placeholder="https://linkedin.com/in/yourprofile"
          disabled={!canEdit}
          className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          style={{
            backgroundColor: "var(--background)",
            borderColor: "var(--border)",
          }}
        />
      </div>

      {/* Resume Upload */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">Resume Text</label>
          {canEdit && (
            <button
              onClick={() => setShowResumeUpload(!showResumeUpload)}
              className="inline-flex items-center gap-1 text-sm font-medium transition-colors"
              style={{ color: "var(--primary)" }}
            >
              <Upload className="h-4 w-4" />
              {showResumeUpload ? "Cancel" : "Upload Resume"}
            </button>
          )}
        </div>
        {showResumeUpload ? (
          <div className="space-y-3">
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste your resume text here..."
              rows={8}
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring resize-none"
              style={{
                backgroundColor: "var(--background)",
                borderColor: "var(--border)",
              }}
            />
            <button
              onClick={uploadResume}
              disabled={saving || !resumeText.trim()}
              className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Resume
            </button>
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            {profile?.raw_resume_text
              ? `Resume uploaded (${profile.raw_resume_text.length} characters)`
              : "No resume uploaded yet."}
          </p>
        )}
      </div>

      {/* Skills Section */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Skills</h2>
          {canEdit && (
            <button
              onClick={() => setShowSkillForm(!showSkillForm)}
              className="inline-flex items-center gap-1 text-sm font-medium transition-colors"
              style={{ color: "var(--primary)" }}
            >
              {showSkillForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showSkillForm ? "Cancel" : "Add Skill"}
            </button>
          )}
        </div>

        {showSkillForm && (
          <div
            className="mb-4 rounded-md border p-4 space-y-3"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium mb-1">Skill Name</label>
                <input
                  type="text"
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  placeholder="e.g. TypeScript"
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Proficiency</label>
                <select
                  value={skillProficiency}
                  onChange={(e) => setSkillProficiency(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                >
                  {proficiencyLevels.map((level) => (
                    <option key={level} value={level}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Years Experience</label>
                <input
                  type="number"
                  value={skillYears}
                  onChange={(e) => setSkillYears(e.target.value)}
                  placeholder="Optional"
                  min="0"
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Source</label>
                <select
                  value={skillSource}
                  onChange={(e) => setSkillSource(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                >
                  {sourceOptions.map((src) => (
                    <option key={src} value={src}>
                      {src.charAt(0).toUpperCase() + src.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={addSkill}
              disabled={!skillName.trim()}
              className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              <Plus className="h-4 w-4" />
              Add Skill
            </button>
          </div>
        )}

        {profile?.skills && profile.skills.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {profile.skills.map((skill) => (
              <div
                key={skill.id}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                <span className="font-medium">{skill.skill_name}</span>
                <span
                  className="text-xs rounded-full px-1.5 py-0.5"
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "var(--accent-foreground)",
                  }}
                >
                  {skill.proficiency_level}
                </span>
                {skill.source !== "manual" && (
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                    ({skill.source})
                  </span>
                )}
                {canEdit && (
                  <button
                    onClick={() => deleteSkill(skill.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            No skills added yet.
          </p>
        )}
      </div>

      {/* Experience Section */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Experience</h2>
          {canEdit && (
            <button
              onClick={() => {
                resetExpForm();
                setShowExpForm(!showExpForm);
              }}
              className="inline-flex items-center gap-1 text-sm font-medium transition-colors"
              style={{ color: "var(--primary)" }}
            >
              {showExpForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showExpForm ? "Cancel" : "Add Experience"}
            </button>
          )}
        </div>

        {showExpForm && (
          <div
            className="mb-4 rounded-md border p-4 space-y-3"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium mb-1">Company</label>
                <input
                  type="text"
                  value={expCompany}
                  onChange={(e) => setExpCompany(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Title</label>
                <input
                  type="text"
                  value={expTitle}
                  onChange={(e) => setExpTitle(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Start Date</label>
                <input
                  type="date"
                  value={expStartDate}
                  onChange={(e) => setExpStartDate(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">End Date</label>
                <input
                  type="date"
                  value={expEndDate}
                  onChange={(e) => setExpEndDate(e.target.value)}
                  disabled={expIsCurrent}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
                <label className="mt-1 flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={expIsCurrent}
                    onChange={(e) => setExpIsCurrent(e.target.checked)}
                  />
                  Currently working here
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Description</label>
              <textarea
                value={expDescription}
                onChange={(e) => setExpDescription(e.target.value)}
                rows={3}
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring resize-none"
                style={{
                  backgroundColor: "var(--background)",
                  borderColor: "var(--border)",
                }}
              />
            </div>
            <button
              onClick={saveExperience}
              disabled={!expCompany.trim() || !expTitle.trim() || !expStartDate}
              className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              <Save className="h-4 w-4" />
              {editingExp ? "Update Experience" : "Add Experience"}
            </button>
          </div>
        )}

        {profile?.experiences && profile.experiences.length > 0 ? (
          <div className="space-y-4">
            {profile.experiences.map((exp) => (
              <div
                key={exp.id}
                className="rounded-md border p-4"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{exp.title}</h3>
                    <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                      {exp.company}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                      {formatDate(exp.start_date)} - {exp.is_current ? "Present" : exp.end_date ? formatDate(exp.end_date) : "N/A"}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEditExp(exp)}
                        className="rounded p-1 transition-colors hover:bg-accent"
                      >
                        <Pencil className="h-3.5 w-3.5" style={{ color: "var(--muted-foreground)" }} />
                      </button>
                      <button
                        onClick={() => deleteExperience(exp.id)}
                        className="rounded p-1 transition-colors hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" style={{ color: "var(--destructive)" }} />
                      </button>
                    </div>
                  )}
                </div>
                {exp.description && (
                  <p className="mt-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                    {exp.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            No experience added yet.
          </p>
        )}
      </div>

      {/* Education Section */}
      <div
        className="rounded-xl border p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--card-foreground)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Education</h2>
          {canEdit && (
            <button
              onClick={() => setShowEduForm(!showEduForm)}
              className="inline-flex items-center gap-1 text-sm font-medium transition-colors"
              style={{ color: "var(--primary)" }}
            >
              {showEduForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showEduForm ? "Cancel" : "Add Education"}
            </button>
          )}
        </div>

        {showEduForm && (
          <div
            className="mb-4 rounded-md border p-4 space-y-3"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium mb-1">Institution</label>
                <input
                  type="text"
                  value={eduInstitution}
                  onChange={(e) => setEduInstitution(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Degree</label>
                <input
                  type="text"
                  value={eduDegree}
                  onChange={(e) => setEduDegree(e.target.value)}
                  placeholder="e.g. Bachelor of Science"
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Field of Study</label>
                <input
                  type="text"
                  value={eduField}
                  onChange={(e) => setEduField(e.target.value)}
                  placeholder="Optional"
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Graduation Date</label>
                <input
                  type="date"
                  value={eduGradDate}
                  onChange={(e) => setEduGradDate(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  style={{
                    backgroundColor: "var(--background)",
                    borderColor: "var(--border)",
                  }}
                />
              </div>
            </div>
            <button
              onClick={addEducation}
              disabled={!eduInstitution.trim() || !eduDegree.trim()}
              className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              <Plus className="h-4 w-4" />
              Add Education
            </button>
          </div>
        )}

        {profile?.educations && profile.educations.length > 0 ? (
          <div className="space-y-4">
            {profile.educations.map((edu) => (
              <div
                key={edu.id}
                className="rounded-md border p-4"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{edu.degree}</h3>
                    <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                      {edu.institution}
                    </p>
                    {edu.field_of_study && (
                      <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        {edu.field_of_study}
                      </p>
                    )}
                    {edu.graduation_date && (
                      <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
                        Graduated: {formatDate(edu.graduation_date)}
                      </p>
                    )}
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => deleteEducation(edu.id)}
                      className="rounded p-1 transition-colors hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" style={{ color: "var(--destructive)" }} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            No education added yet.
          </p>
        )}
      </div>
    </div>
  );
}

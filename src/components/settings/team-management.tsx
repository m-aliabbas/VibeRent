"use client";
import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, LoaderCircle, MailPlus, RefreshCw, ShieldCheck, UserCog, UserPlus } from "lucide-react";
import {
  addTeamMemberDirectAction,
  cancelInvitationAction,
  inviteTeamMemberAction,
  listTeamAction,
  resetMemberPasswordDirectAction,
  updateMemberAction,
  type TeamData,
} from "@/app/actions/organization";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/forms/form-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import type { StaffRole } from "@/server/context/request-context";

const roles: Array<{ value: StaffRole; label: string }> = [
  { value: "fleet_manager", label: "Fleet Manager" },
  { value: "rental_agent", label: "Rental Agent" },
  { value: "accountant", label: "Accountant" },
  { value: "agency_owner", label: "Agency Owner" },
];

export function TeamManagement({ onNotice }: { onNotice: (message: string) => void }) {
  const [data, setData] = useState<TeamData | null>(null);
  const [error, setError] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const reload = useCallback(() => {
    listTeamAction().then(result => {
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError("");
      setData(result.data ?? null);
    });
  }, []);

  useEffect(() => {
    let ignore = false;
    listTeamAction().then(result => {
      if (ignore) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError("");
      setData(result.data ?? null);
    });
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <section className="rounded-xl border bg-white">
      <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6]">
          <UserCog size={19} />
        </span>
        <div className="flex-1">
          <h2 className="font-bold">Users and roles</h2>
          <p className="mt-1 text-xs text-[#667085]">
            Add staff accounts directly, invite team members, assign operational roles, and restrict branch access.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={reload}>
            <RefreshCw size={15} />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setInviteOpen(v => !v);
              setAddOpen(false);
            }}
          >
            <MailPlus size={15} />
            Invite by email
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setAddOpen(v => !v);
              setInviteOpen(false);
            }}
          >
            <UserPlus size={15} />
            Add user directly
          </Button>
        </div>
      </div>

      <div className="p-5">
        {error && (
          <div className="mb-4 rounded-lg border border-[#FECDCA] bg-[#FEF3F2] p-3 text-sm text-[#B42318]">
            {error}
          </div>
        )}

        {addOpen && data && (
          <AddMemberForm
            data={data}
            onDone={async message => {
              onNotice(message);
              setAddOpen(false);
              reload();
            }}
          />
        )}

        {inviteOpen && data && (
          <InviteForm
            data={data}
            onDone={async message => {
              onNotice(message);
              setInviteOpen(false);
              reload();
            }}
          />
        )}

        {!data ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#667085]">
            <LoaderCircle size={18} className="animate-spin" />
            Loading team…
          </div>
        ) : (
          <div className="space-y-7">
            <div>
              <h3 className="text-sm font-bold">Active team</h3>
              <div className="mt-3 space-y-3">
                {data.members.map(member => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    branches={data.branches}
                    onSaved={async message => {
                      onNotice(message);
                      reload();
                    }}
                  />
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold">Invitations</h3>
              {data.invitations.length ? (
                <div className="mt-3 space-y-3">
                  {data.invitations.map(invite => (
                    <article
                      key={invite.id}
                      className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center"
                    >
                      <div className="flex-1">
                        <strong className="text-sm">{invite.email}</strong>
                        <p className="mt-1 text-xs text-[#667085]">
                          {labelRole(invite.role)} ·{" "}
                          {invite.branches.length ? invite.branches.join(", ") : "All branches"} · Expires{" "}
                          {new Intl.DateTimeFormat("en-PK", { dateStyle: "medium" }).format(
                            new Date(invite.expiresAt)
                          )}
                        </p>
                      </div>
                      <StatusBadge status={invite.status} />
                      {invite.status === "pending" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            const result = await cancelInvitationAction(invite.id);
                            if (result.ok) {
                              onNotice(result.message ?? "Invitation cancelled.");
                              reload();
                            } else setError(result.message);
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed p-5 text-sm text-[#667085]">
                  No pending invitations.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function AddMemberForm({
  data,
  onDone,
}: {
  data: TeamData;
  onDone: (message: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<StaffRole>("rental_agent");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function generatePassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
    let generated = "";
    for (let i = 0; i < 12; i++) {
      generated += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(generated);
    setShowPassword(true);
  }

  return (
    <form
      className="mb-6 rounded-xl border border-[#006FE6]/35 bg-[#F5FAFF] p-5 shadow-sm"
      onSubmit={async event => {
        event.preventDefault();
        setPending(true);
        setError("");
        setFieldErrors({});
        const result = await addTeamMemberDirectAction({
          name,
          email,
          password,
          role,
          branchIds,
        });
        setPending(false);
        if (!result.ok) {
          setError(result.message);
          setFieldErrors(result.fieldErrors ?? {});
          return;
        }
        await onDone(result.message ?? "Team member created successfully.");
      }}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#EFF8FF] text-[#006FE6]">
          <UserPlus size={19} />
        </span>
        <div className="flex-1">
          <h3 className="font-bold text-[#101828]">Add team member directly</h3>
          <p className="mt-0.5 text-xs text-[#667085]">
            Create a user account immediately without sending an email invite. They can sign in right away with these credentials.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <FormInput
          label="Full name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Tariq Mehmood"
          error={fieldErrors.name}
          required
        />
        <FormInput
          label="Work email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="tariq@agency.pk"
          error={fieldErrors.email}
          required
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-semibold text-[#344054]">Password</span>
            <button
              type="button"
              onClick={generatePassword}
              className="text-xs font-semibold text-[#006FE6] hover:underline"
            >
              Generate secure password
            </button>
          </div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 10 characters"
              minLength={10}
              required
              className="h-11 w-full rounded-[9px] border border-[#D0D5DD] bg-white px-3 pr-10 text-sm focus:border-[#006FE6] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#667085] hover:text-[#101828]"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {fieldErrors.password && <p className="mt-1 text-xs text-[#B42318]">{fieldErrors.password}</p>}
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-[#344054]">Role</span>
          <select
            value={role}
            onChange={e => setRole(e.target.value as StaffRole)}
            className="h-11 w-full rounded-[9px] border border-[#D0D5DD] bg-white px-3 text-sm focus:border-[#006FE6] focus:outline-none"
          >
            {roles.map(item => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <BranchChoices branches={data.branches} selected={branchIds} onChange={setBranchIds} />

      {error && (
        <div className="mt-3 rounded-lg border border-[#FECDCA] bg-[#FEF3F2] p-3 text-sm text-[#B42318]">
          {error}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button size="sm" disabled={pending}>
          {pending ? <LoaderCircle size={16} className="animate-spin" /> : "Create team member"}
        </Button>
      </div>
    </form>
  );
}

function InviteForm({
  data,
  onDone,
}: {
  data: TeamData;
  onDone: (message: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("rental_agent");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  return (
    <form
      className="mb-6 rounded-xl border border-[#B9D9FF] bg-[#F5FAFF] p-4"
      onSubmit={async event => {
        event.preventDefault();
        setPending(true);
        setError("");
        const result = await inviteTeamMemberAction({ email, role, branchIds });
        setPending(false);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        await onDone(result.message ?? "Invitation sent.");
      }}
    >
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-1 text-[#006FE6]" size={20} />
        <div className="flex-1">
          <h3 className="font-bold">Invite a team member by email</h3>
          <p className="mt-1 text-xs text-[#667085]">
            They will receive an invitation link to join this workspace. Leaving branches unchecked grants all-branch access.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <FormInput
          label="Email address"
          type="email"
          value={email}
          onChange={event => setEmail(event.target.value)}
          required
        />
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-[#344054]">Role</span>
          <select
            value={role}
            onChange={event => setRole(event.target.value as StaffRole)}
            className="h-11 w-full rounded-[9px] border border-[#D0D5DD] bg-white px-3 text-sm"
          >
            {roles
              .filter(item => item.value !== "agency_owner")
              .map(item => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
          </select>
        </label>
      </div>
      <BranchChoices branches={data.branches} selected={branchIds} onChange={setBranchIds} />
      {error && <p className="mt-3 text-sm text-[#B42318]">{error}</p>}
      <div className="mt-4 flex justify-end">
        <Button size="sm" disabled={pending}>
          {pending ? <LoaderCircle size={16} className="animate-spin" /> : "Send invitation"}
        </Button>
      </div>
    </form>
  );
}

function MemberCard({
  member,
  branches,
  onSaved,
}: {
  member: TeamData["members"][number];
  branches: TeamData["branches"];
  onSaved: (message: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(member.role);
  const [active, setActive] = useState(member.active);
  const initialIds = branches
    .filter(branch => member.branches.includes(branch.name))
    .map(branch => branch.id);
  const [branchIds, setBranchIds] = useState(initialIds);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const [resetPwOpen, setResetPwOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resetPending, setResetPending] = useState(false);
  const [resetSuccess, setResetSuccess] = useState("");

  return (
    <article className="rounded-xl border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-sm">{member.name}</strong>
            {member.isCurrentUser && (
              <span className="rounded bg-[#EFF8FF] px-2 py-0.5 text-[10px] font-bold text-[#175CD3]">
                YOU
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[#667085]">
            {member.email} · {labelRole(member.role)} ·{" "}
            {member.branches.length ? member.branches.join(", ") : "All branches"}
          </p>
        </div>
        <StatusBadge status={member.active ? "Active" : "Inactive"} />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            setEditing(value => !value);
            setResetPwOpen(false);
            setResetSuccess("");
          }}
        >
          {editing ? "Close" : "Manage"}
        </Button>
      </div>
      {editing && (
        <div className="mt-4 border-t pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-[#344054]">Role</span>
              <select
                value={role}
                disabled={member.isCurrentUser}
                onChange={event => setRole(event.target.value as StaffRole)}
                className="h-11 w-full rounded-[9px] border border-[#D0D5DD] bg-white px-3 text-sm disabled:bg-[#F2F4F7]"
              >
                {roles.map(item => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex h-11 items-center gap-3 self-end rounded-lg border bg-white px-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={active}
                disabled={member.isCurrentUser}
                onChange={event => setActive(event.target.checked)}
                className="h-4 w-4 accent-[#006FE6]"
              />
              Active membership
            </label>
          </div>
          <BranchChoices branches={branches} selected={branchIds} onChange={setBranchIds} />

          <div className="mt-4 rounded-lg border border-[#EAECF0] bg-[#F8FAFC] p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#475467]">
                Password Reset
              </span>
              <button
                type="button"
                onClick={() => {
                  setResetPwOpen(v => !v);
                  setResetSuccess("");
                }}
                className="text-xs font-semibold text-[#006FE6] hover:underline"
              >
                {resetPwOpen ? "Cancel" : "Set new password for user"}
              </button>
            </div>
            {resetPwOpen && (
              <div className="mt-2.5 flex flex-col sm:flex-row gap-2">
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="New password (min 10 characters)"
                  minLength={10}
                  className="h-9 flex-1 rounded-lg border border-[#D0D5DD] bg-white px-3 text-sm focus:border-[#006FE6] focus:outline-none"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={resetPending || newPassword.length < 10}
                  onClick={async () => {
                    setResetPending(true);
                    setResetSuccess("");
                    const res = await resetMemberPasswordDirectAction({
                      memberUserId: member.id,
                      newPassword,
                    });
                    setResetPending(false);
                    if (res.ok) {
                      setResetSuccess(res.message ?? "Password updated.");
                      setNewPassword("");
                    } else {
                      setError(res.message);
                    }
                  }}
                >
                  {resetPending ? <LoaderCircle size={15} className="animate-spin" /> : "Save password"}
                </Button>
              </div>
            )}
            {resetSuccess && <p className="mt-2 text-xs font-medium text-[#067647]">{resetSuccess}</p>}
          </div>

          {error && <p className="mt-3 text-sm text-[#B42318]">{error}</p>}
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                setError("");
                const result = await updateMemberAction({
                  membershipId: member.membershipId,
                  role,
                  active,
                  branchIds,
                });
                setPending(false);
                if (!result.ok) {
                  setError(result.message);
                  return;
                }
                setEditing(false);
                await onSaved(result.message ?? "Member updated.");
              }}
            >
              {pending ? <LoaderCircle size={16} className="animate-spin" /> : "Save access"}
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

function BranchChoices({branches,selected,onChange}:{branches:TeamData["branches"];selected:string[];onChange:(value:string[])=>void}){return <fieldset className="mt-4"><legend className="text-sm font-semibold text-[#344054]">Branch access <span className="font-normal text-[#667085]">(none selected = all)</span></legend><div className="mt-2 flex flex-wrap gap-2">{branches.map(branch=><label key={branch.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs ${selected.includes(branch.id)?"border-[#84CAFF] bg-white text-[#175CD3]":"border-[#E4E7EC] bg-white text-[#475467]"}`}><input type="checkbox" checked={selected.includes(branch.id)} onChange={event=>onChange(event.target.checked?[...selected,branch.id]:selected.filter(id=>id!==branch.id))} className="accent-[#006FE6]"/>{branch.name}</label>)}</div></fieldset>}
function labelRole(role:string){return role.split("_").map(part=>part[0]?.toUpperCase()+part.slice(1)).join(" ")}

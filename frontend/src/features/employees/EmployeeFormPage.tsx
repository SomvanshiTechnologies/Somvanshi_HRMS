import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  useCreateEmployee,
  useDepartments,
  useDesignations,
  useEmployee,
  useEmployees,
  useLocations,
  useUpdateEmployee,
} from "./useEmployees";
import { useSettings } from "@/features/settings/useSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const NONE = "__none__";

const Schema = z.object({
  employeeCode: z
    .string()
    .min(3, "At least 3 characters")
    .max(24)
    .regex(/^[A-Z0-9][A-Z0-9-]*$/, "Uppercase letters, digits and dashes only")
    .optional()
    .or(z.literal("")),
  firstName: z.string().min(1, "Required").max(80),
  lastName: z.string().min(1, "Required").max(80),
  email: z.string().email("Enter a valid work email"),
  personalEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().max(20).optional().or(z.literal("")),
  dateOfBirth: z.string().optional().or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE", "OTHER", "UNDISCLOSED"]),
  maritalStatus: z.enum(["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "UNDISCLOSED"]),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "CONSULTANT"]),
  dateOfJoining: z.string().optional().or(z.literal("")),
  departmentId: z.string(),
  designationId: z.string(),
  locationId: z.string(),
  managerId: z.string(),
  currentAddress: z.string().max(1000).optional().or(z.literal("")),
  createLoginAccount: z.boolean(),
});
type FormValues = z.infer<typeof Schema>;

export function EmployeeFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const existing = useEmployee(isEdit ? id : undefined);
  const departments = useDepartments();
  const designations = useDesignations();
  const locations = useLocations();
  // manager dropdown: active people, server-fetched
  const managers = useEmployees({ page: 1, limit: 100, status: "ACTIVE" });

  const create = useCreateEmployee();
  const update = useUpdateEmployee(id ?? "");

  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    values: isEdit && existing.data
      ? {
          employeeCode: existing.data["employeeCode"] ?? "",
          firstName: existing.data["firstName"] ?? "",
          lastName: existing.data["lastName"] ?? "",
          email: existing.data["email"] ?? "",
          personalEmail: existing.data["personalEmail"] ?? "",
          phone: existing.data["phone"] ?? "",
          dateOfBirth: existing.data["dateOfBirth"]?.slice(0, 10) ?? "",
          gender: existing.data["gender"] ?? "UNDISCLOSED",
          maritalStatus: existing.data["maritalStatus"] ?? "UNDISCLOSED",
          employmentType: existing.data["employmentType"] ?? "FULL_TIME",
          dateOfJoining: existing.data["dateOfJoining"]?.slice(0, 10) ?? "",
          departmentId: existing.data["department"]?.id ?? NONE,
          designationId: existing.data["designation"]?.id ?? NONE,
          locationId: existing.data["location"]?.id ?? NONE,
          managerId: existing.data["manager"]?.id ?? NONE,
          currentAddress: existing.data["currentAddress"] ?? "",
          createLoginAccount: true,
        }
      : undefined,
    defaultValues: {
      employeeCode: "",
      gender: "UNDISCLOSED",
      maritalStatus: "UNDISCLOSED",
      employmentType: "FULL_TIME",
      departmentId: NONE,
      designationId: NONE,
      locationId: NONE,
      managerId: NONE,
      createLoginAccount: true,
    },
  });

  // Default reporting manager + location for new employees come from Settings
  // (configurable via /settings — no hardcoded names).
  const settings = useSettings();
  React.useEffect(() => {
    if (isEdit || !settings.data) return;
    const ids = new Set((managers.data?.data ?? []).map((m) => m.id));
    if (form.getValues("managerId") === NONE && settings.data.defaultManagerId && ids.has(settings.data.defaultManagerId)) {
      form.setValue("managerId", settings.data.defaultManagerId);
    }
    if (form.getValues("locationId") === NONE && settings.data.defaultLocationId) {
      form.setValue("locationId", settings.data.defaultLocationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managers.data, settings.data, isEdit]);

  const onSubmit = form.handleSubmit(async (values) => {
    const payload: Record<string, unknown> = {
      ...values,
      employeeCode: values.employeeCode?.trim() ? values.employeeCode.trim() : undefined,
      personalEmail: values.personalEmail || null,
      phone: values.phone || null,
      dateOfBirth: values.dateOfBirth || null,
      dateOfJoining: values.dateOfJoining || null,
      currentAddress: values.currentAddress || null,
      departmentId: values.departmentId === NONE ? null : values.departmentId,
      designationId: values.designationId === NONE ? null : values.designationId,
      locationId: values.locationId === NONE ? null : values.locationId,
      managerId: values.managerId === NONE ? null : values.managerId,
    };
    if (isEdit) {
      const { createLoginAccount: _c, email: _e, ...rest } = payload;
      await update.mutateAsync(rest);
      navigate(`/employees/${id}`);
    } else {
      const created = await create.mutateAsync(payload);
      navigate(`/employees/${created.id}`);
    }
  });

  if (isEdit && existing.isLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const err = form.formState.errors;
  const selectControl = (
    name: "departmentId" | "designationId" | "locationId" | "managerId",
    label: string,
    options: Array<{ value: string; label: string }>,
    loading: boolean
  ) => (
    <FormField label={label} error={err[name]?.message}>
      <Select value={form.watch(name)} onValueChange={(v) => form.setValue(name, v, { shouldDirty: true })}>
        <SelectTrigger aria-label={label} disabled={loading}>
          <SelectValue placeholder={loading ? "Loading…" : `Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— None —</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  );

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft />
        </Button>
        <div>
          <h1 className="text-xl font-semibold text-text">{isEdit ? "Edit Employee" : "Add Employee"}</h1>
          <p className="text-sm text-text-muted">
            {isEdit ? `${existing.data?.["employeeCode"]} · ${existing.data?.["email"]}` : "Create the master record; a login account is provisioned automatically."}
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Personal Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="First name" htmlFor="firstName" required error={err.firstName?.message}>
              <Input id="firstName" error={!!err.firstName} {...form.register("firstName")} />
            </FormField>
            <FormField label="Last name" htmlFor="lastName" required error={err.lastName?.message}>
              <Input id="lastName" error={!!err.lastName} {...form.register("lastName")} />
            </FormField>
            <FormField label="Work email" htmlFor="email" required error={err.email?.message}>
              <Input id="email" type="email" disabled={isEdit} error={!!err.email} {...form.register("email")} />
            </FormField>
            <FormField label="Personal email" htmlFor="personalEmail" error={err.personalEmail?.message}>
              <Input id="personalEmail" type="email" {...form.register("personalEmail")} />
            </FormField>
            <FormField label="Phone" htmlFor="phone" error={err.phone?.message}>
              <Input id="phone" {...form.register("phone")} />
            </FormField>
            <FormField label="Date of birth" htmlFor="dateOfBirth" error={err.dateOfBirth?.message}>
              <Input id="dateOfBirth" type="date" {...form.register("dateOfBirth")} />
            </FormField>
            <FormField label="Gender" error={err.gender?.message}>
              <Select value={form.watch("gender")} onValueChange={(v) => form.setValue("gender", v as FormValues["gender"])}>
                <SelectTrigger aria-label="Gender">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["MALE", "FEMALE", "OTHER", "UNDISCLOSED"].map((g) => (
                    <SelectItem key={g} value={g}>
                      {g.charAt(0) + g.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Marital status" error={err.maritalStatus?.message}>
              <Select value={form.watch("maritalStatus")} onValueChange={(v) => form.setValue("maritalStatus", v as FormValues["maritalStatus"])}>
                <SelectTrigger aria-label="Marital status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "UNDISCLOSED"].map((m) => (
                    <SelectItem key={m} value={m}>
                      {m.charAt(0) + m.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Current address" htmlFor="currentAddress" className="sm:col-span-2" error={err.currentAddress?.message}>
              <Textarea id="currentAddress" rows={2} {...form.register("currentAddress")} />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Employment</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Employee ID"
              htmlFor="employeeCode"
              error={err.employeeCode?.message}
              hint={isEdit ? "Changing this updates the employee's code everywhere" : "Leave blank to auto-generate (e.g. SOM-0007)"}
            >
              <Input id="employeeCode" placeholder="e.g. IT-PUN-004" {...form.register("employeeCode")} />
            </FormField>
            <FormField label="Employment type" error={err.employmentType?.message}>
              <Select value={form.watch("employmentType")} onValueChange={(v) => form.setValue("employmentType", v as FormValues["employmentType"])}>
                <SelectTrigger aria-label="Employment type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "CONSULTANT"].map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Date of joining" htmlFor="dateOfJoining" error={err.dateOfJoining?.message}>
              <Input id="dateOfJoining" type="date" {...form.register("dateOfJoining")} />
            </FormField>
            {selectControl(
              "departmentId",
              "Department",
              (departments.data ?? []).map((d) => ({ value: d.id, label: d.name })),
              departments.isLoading
            )}
            {selectControl(
              "designationId",
              "Designation",
              (designations.data ?? []).map((d) => ({ value: d.id, label: d.title })),
              designations.isLoading
            )}
            {selectControl(
              "locationId",
              "Location",
              (locations.data ?? []).map((l) => ({ value: l.id, label: l.name })),
              locations.isLoading
            )}
            {selectControl(
              "managerId",
              "Reporting manager",
              (managers.data?.data ?? [])
                .filter((m) => m.id !== id)
                .map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName} (${m.employeeCode})` })),
              managers.isLoading
            )}
            {!isEdit && (
              <label className="flex items-center gap-2.5 sm:col-span-2 text-sm text-text cursor-pointer">
                <input type="checkbox" className="size-4 accent-(--brand-primary)" {...form.register("createLoginAccount")} />
                Provision a SomHR login and email a temporary password
              </label>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending || update.isPending}>
            {isEdit ? "Save changes" : "Create employee"}
          </Button>
        </div>
      </form>
    </div>
  );
}

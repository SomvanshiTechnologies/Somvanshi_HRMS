import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErrorMessage } from "@/lib/api";

const get = <T>(url: string, params?: Record<string, unknown>) =>
  api.get<{ data: T }>(url, { params }).then((r) => r.data.data);

export interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  department: string;
  priority: string;
  status: string;
  slaBreached: boolean;
  createdAt: string;
  category: { id: string; name: string; department: string };
  requester: { id: string; employeeCode: string; firstName: string; lastName: string; photoUrl: string | null };
  assignee: { id: string; firstName: string; lastName: string; photoUrl: string | null } | null;
  comments?: Array<{ id: string; authorId: string; body: string; isInternal: boolean; createdAt: string }>;
  _count?: { comments: number };
}

export interface TicketCategory {
  id: string;
  name: string;
  department: string;
}

export const useTicketCategories = () =>
  useQuery({ queryKey: ["helpdesk", "categories"], queryFn: () => get<TicketCategory[]>("/helpdesk/categories"), staleTime: 600_000 });

export const useTickets = (filters: { status?: string; department?: string; priority?: string; scope?: string }) =>
  useQuery({ queryKey: ["helpdesk", "tickets", filters], queryFn: () => get<{ tickets: Ticket[]; agentView: boolean }>("/helpdesk/tickets", filters) });

export const useTicket = (id: string | null) =>
  useQuery({ queryKey: ["helpdesk", "ticket", id], queryFn: () => get<Ticket>(`/helpdesk/tickets/${id}`), enabled: Boolean(id) });

export const useHelpdeskSummary = (enabled: boolean) =>
  useQuery({ queryKey: ["helpdesk", "summary"], queryFn: () => get<{ open: number; slaBreached: number; byStatus: Record<string, number>; byPriority: Record<string, number> }>("/helpdesk/summary"), enabled });

function useHd<T>(fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (res) => {
      const msg = (res as { data?: { message?: string } })?.data?.message;
      if (msg) toast.success(msg);
      void queryClient.invalidateQueries({ queryKey: ["helpdesk"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });
}

export const useCreateTicket = () => useHd((input: Record<string, unknown>) => api.post("/helpdesk/tickets", input));
export const useAddComment = () => useHd((input: { id: string; body: string; isInternal?: boolean }) => api.post(`/helpdesk/tickets/${input.id}/comments`, { body: input.body, isInternal: input.isInternal }));
export const useAssignTicket = () => useHd((input: { id: string; assigneeId: string }) => api.patch(`/helpdesk/tickets/${input.id}/assign`, { assigneeId: input.assigneeId }));
export const useTicketStatus = () => useHd((input: { id: string; status: string }) => api.patch(`/helpdesk/tickets/${input.id}/status`, { status: input.status }));

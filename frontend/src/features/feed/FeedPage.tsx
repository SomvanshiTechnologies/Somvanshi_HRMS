import * as React from "react";
import { motion } from "framer-motion";
import { Megaphone, MessageSquare, Pin, Plus, Send, ThumbsUp, Trash2 } from "lucide-react";
import {
  ANNOUNCEMENT_CATEGORIES, useAddComment, useAnnouncement, useCreateAnnouncement,
  useDeleteAnnouncement, useDeleteComment, useFeed, useReact, type Announcement,
} from "./useFeed";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuthStore } from "@/stores/auth";
import { cn, formatDateTime, initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/form-field";

function AuthorRow({ a, when, sub }: { a: { firstName: string; lastName: string; photoUrl: string | null; designation?: { title: string } | null }; when: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar size="sm">{a.photoUrl && <AvatarImage src={a.photoUrl} alt="" />}<AvatarFallback>{initials(a.firstName, a.lastName)}</AvatarFallback></Avatar>
      <div className="min-w-0">
        <p className="text-sm font-medium text-text truncate">{a.firstName} {a.lastName}</p>
        <p className="text-[11px] text-text-faint">{sub ?? a.designation?.title ?? ""}{sub ? "" : " · "}{formatDateTime(when)}</p>
      </div>
    </div>
  );
}

function Comments({ id }: { id: string }) {
  const detail = useAnnouncement(id);
  const add = useAddComment();
  const del = useDeleteComment();
  const me = useAuthStore((s) => s.user);
  const canModerate = usePermissions().can("announcement:manage");
  const [text, setText] = React.useState("");
  const comments = detail.data?.comments ?? [];
  return (
    <div className="mt-3 border-t border-border pt-3 space-y-3">
      {detail.isLoading ? <Skeleton className="h-12" /> : comments.map((c) => (
        <div key={c.id} className="flex items-start gap-2">
          <Avatar size="sm">{c.author.photoUrl && <AvatarImage src={c.author.photoUrl} alt="" />}<AvatarFallback>{initials(c.author.firstName, c.author.lastName)}</AvatarFallback></Avatar>
          <div className="min-w-0 flex-1 rounded-lg bg-surface-sunken px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-text">{c.author.firstName} {c.author.lastName}</span>
              <span className="flex items-center gap-2"><span className="text-[10px] text-text-faint">{formatDateTime(c.createdAt)}</span>
                {(c.authorEmployeeId === me?.employee?.id || canModerate) && <button onClick={() => del.mutate({ id, cid: c.id })} className="text-text-faint hover:text-danger cursor-pointer" aria-label="Delete comment"><Trash2 className="size-3" /></button>}
              </span>
            </div>
            <p className="text-sm text-text">{c.body}</p>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { add.mutate({ id, body: text }); setText(""); } }} placeholder="Write a comment…" aria-label="Comment" />
        <Button size="icon" disabled={!text.trim()} onClick={() => { add.mutate({ id, body: text }); setText(""); }} aria-label="Send"><Send className="size-4" /></Button>
      </div>
    </div>
  );
}

function AnnouncementCard({ a }: { a: Announcement }) {
  const react = useReact();
  const del = useDeleteAnnouncement();
  const canManage = usePermissions().can("announcement:manage");
  const [showComments, setShowComments] = React.useState(false);
  const cat = ANNOUNCEMENT_CATEGORIES[a.category] ?? ANNOUNCEMENT_CATEGORIES["GENERAL"]!;
  return (
    <Card className={cn("rounded-xl p-4", a.isPinned && "ring-1 ring-primary/30")}>
      <div className="flex items-start justify-between gap-2">
        <AuthorRow a={a.author} when={a.publishedAt} />
        <div className="flex items-center gap-1.5">
          {a.isPinned && <Pin className="size-3.5 text-primary dark:text-chart-3" />}
          <Badge variant={cat.variant as never}>{cat.emoji} {cat.label}</Badge>
          {canManage && <button onClick={() => del.mutate(a.id)} className="text-text-faint hover:text-danger cursor-pointer" aria-label="Delete"><Trash2 className="size-3.5" /></button>}
        </div>
      </div>
      <h3 className="mt-3 font-semibold text-text">{a.title}</h3>
      <p className="mt-1 text-sm text-text whitespace-pre-wrap">{a.body}</p>
      <div className="mt-3 flex items-center gap-4 border-t border-border pt-2.5">
        <button onClick={() => react.mutate(a.id)} className={cn("flex items-center gap-1.5 text-xs transition-colors cursor-pointer", a.reacted ? "text-primary dark:text-chart-3 font-medium" : "text-text-muted hover:text-text")} aria-label="Like">
          <ThumbsUp className={cn("size-4", a.reacted && "fill-current")} /> {a.reactionCount > 0 && a.reactionCount} Like
        </button>
        <button onClick={() => setShowComments((s) => !s)} className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text cursor-pointer" aria-label="Comments">
          <MessageSquare className="size-4" /> {a.commentCount > 0 && a.commentCount} Comment
        </button>
      </div>
      {showComments && <Comments id={a.id} />}
    </Card>
  );
}

function CreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateAnnouncement();
  const [form, setForm] = React.useState({ title: "", body: "", category: "GENERAL", isPinned: false });
  const reset = () => setForm({ title: "", body: "", category: "GENERAL", isPinned: false });
  const valid = form.title.trim().length >= 3 && form.body.trim().length >= 3;
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Megaphone className="size-4 text-primary dark:text-chart-3" /> New announcement</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <FormField label="Title" required><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></FormField>
          <FormField label="Message" required><Textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Share an update with the company…" /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Category">
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ANNOUNCEMENT_CATEGORIES).map(([k, c]) => <SelectItem key={k} value={k}>{c.emoji} {c.label}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <label className="flex items-end gap-2 text-sm text-text pb-2"><input type="checkbox" checked={form.isPinned} onChange={(e) => setForm({ ...form, isPinned: e.target.checked })} /> Pin to top</label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => { onOpenChange(false); reset(); }}>Cancel</Button>
          <Button disabled={!valid} loading={create.isPending} onClick={async () => { await create.mutateAsync(form); onOpenChange(false); reset(); }}>Publish</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FeedPage() {
  const { can } = usePermissions();
  const [category, setCategory] = React.useState("all");
  const feed = useFeed(category === "all" ? undefined : category);
  const [createOpen, setCreateOpen] = React.useState(false);

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text flex items-center gap-2"><Megaphone className="size-5 text-primary dark:text-chart-3" /> Company Feed</h1>
          <p className="text-sm text-text-muted">Announcements, policies and updates from across the company.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-40 h-9" aria-label="Category"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All posts</SelectItem>
              {Object.entries(ANNOUNCEMENT_CATEGORIES).map(([k, c]) => <SelectItem key={k} value={k}>{c.emoji} {c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {can("announcement:manage") && <Button onClick={() => setCreateOpen(true)}><Plus /> Post</Button>}
        </div>
      </div>

      {feed.isLoading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
      ) : !feed.data?.length ? (
        <EmptyState icon={Megaphone} title="No announcements yet" description={can("announcement:manage") ? "Publish the first company-wide announcement." : "Company updates will appear here."} />
      ) : (
        <div className="space-y-4">
          {feed.data.map((a, i) => (
            <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.3) }}>
              <AnnouncementCard a={a} />
            </motion.div>
          ))}
        </div>
      )}

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

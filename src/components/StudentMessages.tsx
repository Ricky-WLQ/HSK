"use client";

import { Megaphone, MessagesSquare } from "lucide-react";
import MessagePanel from "@/components/MessagePanel";
import { t } from "@/i18n";

export default function StudentMessages({ classId, selfId }: { classId: string; selfId: string }) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-heading mb-3 flex items-center gap-2 text-lg font-bold text-foreground/70">
          <Megaphone className="h-5 w-5" /> {t.messages.announcements}
        </h2>
        <MessagePanel classId={classId} studentId={null} canPost={false} emptyText={t.messages.noAnnouncements} />
      </section>

      <section>
        <h2 className="font-heading mb-3 flex items-center gap-2 text-lg font-bold text-foreground/70">
          <MessagesSquare className="h-5 w-5" /> {t.messages.teacherThread}
        </h2>
        <MessagePanel classId={classId} studentId={selfId} canPost emptyText={t.messages.noMessages} />
      </section>
    </div>
  );
}

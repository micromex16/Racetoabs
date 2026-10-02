import { db } from "../db";

export async function globalSearch(q: string) {
  const term = q.trim();
  if (term.length < 2) return { results: [] };
  const ci = { contains: term, mode: "insensitive" as const };
  const [goals, tasks, cards, parking, threads, people, followUps] = await Promise.all([
    db.goal.findMany({ where: { OR: [{ title: ci }, { notes: ci }], archivedAt: null }, take: 8 }),
    db.task.findMany({ where: { OR: [{ title: ci }, { notes: ci }], status: { not: "CANCELLED" } }, take: 8 }),
    db.pipelineCard.findMany({ where: { OR: [{ company: ci }, { nextAction: ci }, { notes: ci }, { contacts: { some: { name: ci } } }] }, take: 8 }),
    db.parkingItem.findMany({ where: { text: ci, status: { not: "DELETED" } }, take: 6 }),
    db.thread.findMany({
      where: { OR: [{ subject: ci }, { snippet: ci }, { messages: { some: { body: ci } } }, { messages: { some: { fromName: ci } } }] },
      orderBy: { lastMessageAt: "desc" },
      take: 10,
    }),
    db.person.findMany({ where: { name: ci }, take: 5 }),
    db.followUp.findMany({ where: { title: ci }, include: { person: true }, take: 6 }),
  ]);
  const results = [
    ...goals.map((g) => ({ type: "goal" as const, id: g.id, title: g.title, sub: g.level.toLowerCase(), href: `/goals?focus=${g.id}` })),
    ...tasks.map((t) => ({ type: "task" as const, id: t.id, title: t.title, sub: t.status === "DONE" ? "done" : "task", href: `/goals?task=${t.id}` })),
    ...followUps.map((f) => ({ type: "followup" as const, id: f.id, title: f.title, sub: `follow-up · ${f.person?.name ?? ""}`, href: `/accountability?focus=${f.id}` })),
    ...cards.map((c) => ({ type: "card" as const, id: c.id, title: c.company, sub: `pipeline · ${c.stage.toLowerCase()}`, href: `/pipeline?card=${c.id}` })),
    ...threads.map((t) => ({ type: "thread" as const, id: t.id, title: t.subject || t.snippet.slice(0, 60), sub: t.channel.toLowerCase(), href: `/comms?thread=${t.id}` })),
    ...parking.map((p) => ({ type: "parking" as const, id: p.id, title: p.text, sub: "parking lot", href: `/parking` })),
    ...people.map((p) => ({ type: "person" as const, id: p.id, title: p.name, sub: p.role || "person", href: `/accountability?person=${p.id}` })),
  ];
  return { results };
}

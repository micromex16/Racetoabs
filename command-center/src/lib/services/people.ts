import { db } from "../db";

export async function listPeople(includeArchived = false) {
  return db.person.findMany({
    where: includeArchived ? {} : { archivedAt: null },
    orderBy: [{ isTeam: "desc" }, { name: "asc" }],
  });
}

export type PersonInput = { name: string; role?: string; email?: string | null; slackId?: string | null; whatsapp?: string | null; isTeam?: boolean };

export async function upsertPerson(id: string | null, input: PersonInput) {
  if (id) return db.person.update({ where: { id }, data: input });
  return db.person.create({ data: input });
}

export async function archivePerson(id: string) {
  return db.person.update({ where: { id }, data: { archivedAt: new Date() } });
}

/** Find a person by (fuzzy) name, creating them if asked. */
export async function findPersonByName(name: string, create = false) {
  const n = name.trim();
  if (!n) return null;
  const exact = await db.person.findFirst({ where: { name: { equals: n, mode: "insensitive" }, archivedAt: null } });
  if (exact) return exact;
  const starts = await db.person.findFirst({ where: { name: { startsWith: n, mode: "insensitive" }, archivedAt: null } });
  if (starts) return starts;
  const contains = await db.person.findFirst({ where: { name: { contains: n, mode: "insensitive" }, archivedAt: null } });
  if (contains) return contains;
  if (!create) return null;
  return db.person.create({ data: { name: n, isTeam: true } });
}

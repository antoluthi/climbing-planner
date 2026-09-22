// Tests du protocole CalDAV — `npm run test:caldav` (aucune dépendance).
//
// On teste la couche pure (`_caldav.js`) : c'est là qu'est tout ce qu'un client
// lit. La route n'ajoute que Supabase et les en-têtes.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractEvents, buildPropfind, buildReport, parseDavRequest,
  hrefFor, uidFromHref, inTimeRange, eventBounds, buildSingleICS, etagFor,
  stripXmlUnsafe, hasXmlUnsafe, xe, diagnose, pathSegments,
} from "./_caldav.js";

// ─── Jeu de données ───────────────────────────────────────────────────────────

const PLAN = {
  profile: { firstName: "Anto", calendarToken: "11111111-2222-3333-4444-555555555555" },
  weeks: {
    "2026-09-14": [
      [{ id: "c_ab12", name: "Bloc & résistance", discipline: "climbing", startTime: "18:30", duration: 90, chargePlanned: 7, location: "Arkose Nation", notes: "4x4, repos 3'" }],
      [],
      // Sans identifiant, et avec un nom plein de caractères hostiles à une URL.
      [{ name: "Sortie longue, allure 5:30/km", discipline: "running", startTime: "07:00", duration: 60 }],
      [], [], [], [],
    ],
  },
  quickSessions: [
    { id: "c_evt1", name: "Compét' Blocs — Lyon", mode: "event", isQuick: true, allDay: true, startDate: "2026-09-19", endDate: "2026-09-20", chargePlanned: 9 },
  ],
};

const BASE = "/api/caldav/11111111-2222-3333-4444-555555555555/";
const CTX = { baseHref: BASE, displayName: "Planning Escalade — Anto", ctag: "2026-09-15T18:20:00Z", color: "#FF4500FF" };

const events = extractEvents(PLAN);

// ─── Extraction ───────────────────────────────────────────────────────────────

test("extrait les séances des semaines et les échéances", () => {
  assert.equal(events.length, 3);
  assert.ok(events.some((e) => e.uid === "climbing-2026-09-14-c_ab12-t1830@climbing-planner"));
  assert.ok(events.some((e) => e.uid === "climbing-quick-c_evt1@climbing-planner"));
});

test("un UID ne contient jamais de caractère hostile à une URL", () => {
  for (const e of events) {
    assert.match(e.uid, /^[A-Za-z0-9._@-]+$/, `UID non sûr : ${e.uid}`);
  }
});

test("ne jette pas sur des données mal formées", () => {
  const junk = {
    weeks: { "pas-une-date": [[{ name: "x" }]], "2026-09-14": "pas un tableau", "2026-09-21": [null, [null, { name: 42 }]] },
    quickSessions: [null, { name: "sans date" }, { name: "date illisible", startDate: "???" }, "texte"],
  };
  assert.doesNotThrow(() => extractEvents(junk));
  assert.doesNotThrow(() => extractEvents(null));
  assert.doesNotThrow(() => extractEvents({ weeks: null, quickSessions: null }));
});

test("une séance sans heure couvre la journée ; une échéance sa plage", () => {
  const evt = events.find((e) => e.uid.startsWith("climbing-quick"));
  const { start, end } = eventBounds(evt);
  assert.equal(start.toISOString(), "2026-09-19T00:00:00.000Z");
  assert.equal(end.toISOString(), "2026-09-21T00:00:00.000Z"); // DTEND exclusif
});

// ─── href ─────────────────────────────────────────────────────────────────────

test("un href est encodé et reste dans la collection", () => {
  for (const e of events) {
    const href = hrefFor(BASE, e.uid);
    assert.ok(href.startsWith(BASE), href);
    // Un seul niveau sous la collection : pas de « / » venu du nom d'une séance.
    assert.equal(href.slice(BASE.length).includes("/"), false, href);
    assert.doesNotThrow(() => new URL(href, "https://example.test"));
    assert.equal(uidFromHref(href), e.uid);
  }
});

test("uidFromHref accepte un href absolu, relatif ou non encodé", () => {
  assert.equal(uidFromHref("https://x.test" + BASE + "climbing-quick-c_evt1%40climbing-planner.ics"), "climbing-quick-c_evt1@climbing-planner");
  assert.equal(uidFromHref(BASE + "climbing-quick-c_evt1@climbing-planner.ics"), "climbing-quick-c_evt1@climbing-planner");
  assert.equal(uidFromHref(""), "");
});

// ─── Lecture des requêtes ─────────────────────────────────────────────────────

test("lit un PROPFIND quel que soit le préfixe de namespace", () => {
  const a = parseDavRequest('<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:current-user-principal/></d:prop></d:propfind>');
  assert.equal(a.root.local, "propfind");
  assert.deepEqual(a.props.map((p) => p.local), ["resourcetype", "current-user-principal"]);

  // Namespace par défaut, sans préfixe.
  const b = parseDavRequest('<propfind xmlns="DAV:"><prop><displayname/></prop></propfind>');
  assert.deepEqual(b.props.map((p) => p.local), ["displayname"]);

  // allprop, et corps vide.
  assert.equal(parseDavRequest('<A:propfind xmlns:A="DAV:"><A:allprop/></A:propfind>').allprop, true);
  assert.equal(parseDavRequest("").root, null);
  assert.doesNotThrow(() => parseDavRequest("<pas<du<xml"));
});

test("lit le time-range d'un calendar-query et les href d'un multiget", () => {
  const q = parseDavRequest(`<?xml version="1.0"?>
    <C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
      <D:prop><D:getetag/></D:prop>
      <C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT">
        <C:time-range start="20260916T000000Z" end="20260920T000000Z"/>
      </C:comp-filter></C:comp-filter></C:filter>
    </C:calendar-query>`);
  assert.equal(q.root.local, "calendar-query");
  assert.equal(q.timeRange.start.toISOString(), "2026-09-16T00:00:00.000Z");
  assert.equal(q.timeRange.end.toISOString(), "2026-09-20T00:00:00.000Z");
  // Un `<D:href>` à l'intérieur de `<D:prop>` ne doit pas être pris pour une cible.
  assert.deepEqual(q.hrefs, []);

  const m = parseDavRequest(`<?xml version="1.0"?>
    <C:calendar-multiget xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
      <D:prop><D:getetag/><C:calendar-data/></D:prop>
      <D:href>${BASE}climbing-quick-c_evt1%40climbing-planner.ics</D:href>
    </C:calendar-multiget>`);
  assert.equal(m.root.local, "calendar-multiget");
  assert.deepEqual(m.hrefs.map(uidFromHref), ["climbing-quick-c_evt1@climbing-planner"]);
});

// ─── PROPFIND ─────────────────────────────────────────────────────────────────

function propfind(body, depth = "0", event = null) {
  return buildPropfind({ ...CTX, events, depth, event, request: parseDavRequest(body) });
}

test("PROPFIND Depth:0 : la collection est un calendrier découvrable", () => {
  const xml = propfind('<propfind xmlns="DAV:"><prop><resourcetype/><displayname/><current-user-principal/></prop></propfind>');
  assert.match(xml, /<D:multistatus/);
  assert.match(xml, /<D:resourcetype><D:collection\/><C:calendar\/><\/D:resourcetype>/);
  assert.match(xml, /<D:current-user-principal><D:href>\/api\/caldav\/[^<]+\/<\/D:href><\/D:current-user-principal>/);
  assert.match(xml, /<D:status>HTTP\/1\.1 200 OK<\/D:status>/);
  // Une seule ressource à Depth 0.
  assert.equal((xml.match(/<D:response>/g) || []).length, 1);
});

test("PROPFIND sans corps répond le jeu complet (allprop implicite)", () => {
  const xml = propfind("");
  for (const prop of ["resourcetype", "displayname", "current-user-principal", "supported-report-set"]) {
    assert.match(xml, new RegExp(`<D:${prop}[ />]`), prop);
  }
  assert.match(xml, /<C:calendar-home-set>/);
  assert.match(xml, /<C:supported-calendar-component-set><C:comp name="VEVENT"\/>/);
  assert.match(xml, /<CS:getctag>/);
});

test("une propriété inconnue repart en 404, pas en 200", () => {
  const xml = propfind('<propfind xmlns="DAV:"><prop><resourcetype/><quota-used-bytes/></prop></propfind>');
  assert.match(xml, /<D:quota-used-bytes\/>[\s\S]*?<D:status>HTTP\/1\.1 404 Not Found<\/D:status>/);
  assert.match(xml, /<D:resourcetype>[\s\S]*?<D:status>HTTP\/1\.1 200 OK<\/D:status>/);
});

test("on n'annonce que les rapports qu'on sait produire", () => {
  const xml = propfind('<propfind xmlns="DAV:"><prop><supported-report-set/></prop></propfind>');
  assert.match(xml, /<C:calendar-query\/>/);
  assert.match(xml, /<C:calendar-multiget\/>/);
  // sync-collection n'est pas annoncé : on ne sait pas produire de delta.
  assert.equal(/sync-collection/.test(xml), false);
});

test("PROPFIND Depth:1 liste la collection et chaque séance", () => {
  const xml = propfind('<propfind xmlns="DAV:"><prop><getetag/><getcontenttype/></prop></propfind>', "1");
  assert.equal((xml.match(/<D:response>/g) || []).length, 1 + events.length);
  for (const e of events) {
    assert.ok(xml.includes(`<D:href>${hrefFor(BASE, e.uid)}</D:href>`), e.uid);
  }
  // Depth 1 ne transporte jamais le contenu des .ics : c'est ce qui garde la
  // réponse petite quand le planning grossit.
  assert.equal(/BEGIN:VCALENDAR/.test(xml), false);
});

test("PROPFIND sur un .ics décrit la ressource, pas la collection", () => {
  const evt = events[0];
  const xml = propfind('<propfind xmlns="DAV:"><prop><resourcetype/><getetag/></prop></propfind>', "0", evt);
  assert.equal((xml.match(/<D:response>/g) || []).length, 1);
  assert.match(xml, /<D:resourcetype\/>/); // vide : ce n'est pas une collection
  assert.match(xml, /<D:getetag>&quot;[0-9a-f]+&quot;<\/D:getetag>/);
});

// ─── REPORT ───────────────────────────────────────────────────────────────────

function report(body, scope = events) {
  return buildReport({ baseHref: BASE, events: scope, request: parseDavRequest(body), syncToken: "urn:tp:sync:1" });
}

test("calendar-query renvoie les .ics, filtrés par time-range", () => {
  const all = report(`<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
    <D:prop><D:getetag/><C:calendar-data/></D:prop>
    <C:filter><C:comp-filter name="VCALENDAR"/></C:filter></C:calendar-query>`);
  assert.equal(all.status, 207);
  assert.equal((all.body.match(/<D:response>/g) || []).length, 3);
  assert.match(all.body, /<C:calendar-data>BEGIN:VCALENDAR/);

  const narrowed = report(`<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
    <D:prop><D:getetag/></D:prop>
    <C:filter><C:comp-filter name="VCALENDAR"><C:comp-filter name="VEVENT">
      <C:time-range start="20260919T000000Z" end="20260921T000000Z"/>
    </C:comp-filter></C:comp-filter></C:filter></C:calendar-query>`);
  assert.equal((narrowed.body.match(/<D:response>/g) || []).length, 1);
  assert.match(narrowed.body, /climbing-quick-c_evt1/);
});

test("calendar-multiget ne renvoie que ce qui est demandé", () => {
  const uid = "climbing-quick-c_evt1@climbing-planner";
  const r = report(`<C:calendar-multiget xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
    <D:prop><D:getetag/><C:calendar-data/></D:prop>
    <D:href>${hrefFor(BASE, uid)}</D:href>
  </C:calendar-multiget>`);
  assert.equal((r.body.match(/<D:response>/g) || []).length, 1);
  assert.ok(r.body.includes(hrefFor(BASE, uid)));
});

test("un href inconnu dans un multiget repart en 404 (l'événement a disparu)", () => {
  const r = report(`<C:calendar-multiget xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
    <D:prop><D:getetag/></D:prop>
    <D:href>${BASE}climbing-supprimee%40climbing-planner.ics</D:href>
  </C:calendar-multiget>`);
  assert.match(r.body, /<D:status>HTTP\/1\.1 404 Not Found<\/D:status>/);
});

test("sync-collection porte son sync-token (RFC 6578)", () => {
  const r = report('<D:sync-collection xmlns:D="DAV:"><D:sync-token/><D:prop><D:getetag/></D:prop></D:sync-collection>');
  assert.equal(r.status, 207);
  assert.match(r.body, /<D:sync-token>urn:tp:sync:1<\/D:sync-token>/);
});

test("un rapport inconnu repart en 403 supported-report", () => {
  const r = report('<D:principal-match xmlns:D="DAV:"/>');
  assert.equal(r.status, 403);
  assert.match(r.body, /<D:supported-report\/>/);
});

// ─── ICS ──────────────────────────────────────────────────────────────────────

test("un .ics est complet et correctement échappé", () => {
  const evt = events.find((e) => e.uid.includes("c_ab12"));
  const ics = buildSingleICS(evt.uid, evt.session, evt.date, evt.endDate);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.match(ics, /DTSTART:20260914T183000\r\n/);
  assert.match(ics, /DTEND:20260914T200000\r\n/);
  assert.match(ics, /SUMMARY:Bloc & résistance\r\n/);
  assert.match(ics, /4x4\\, repos/); // virgule échappée
  assert.match(ics, /\\n/);          // saut de ligne échappé dans DESCRIPTION
});

test("une échéance est un événement journée entière, DTEND exclusif", () => {
  const evt = events.find((e) => e.uid.startsWith("climbing-quick"));
  const ics = buildSingleICS(evt.uid, evt.session, evt.date, evt.endDate);
  assert.match(ics, /DTSTART;VALUE=DATE:20260919/);
  assert.match(ics, /DTEND;VALUE=DATE:20260921/);
});

test("le repli de ligne ne coupe pas un caractère accentué en deux", () => {
  const long = { name: "é".repeat(120), startTime: "10:00", duration: 60 };
  const ics = buildSingleICS("u@x", long, new Date(Date.UTC(2026, 8, 14)), null);
  for (const line of ics.split("\r\n")) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75, `ligne de ${Buffer.byteLength(line, "utf8")} octets`);
  }
  // Rien n'a été perdu ni corrompu au recollage.
  const unfolded = ics.replace(/\r\n /g, "");
  assert.ok(unfolded.includes("SUMMARY:" + "é".repeat(120)));
});

test("l'ETag suit tout ce que le .ics contient", () => {
  const e = events[0];
  const base = etagFor(e.uid, e.session, e.date, e.endDate);
  assert.equal(etagFor(e.uid, { ...e.session }, e.date, e.endDate), base);
  assert.notEqual(etagFor(e.uid, { ...e.session, notes: "autre chose" }, e.date, e.endDate), base);
  assert.notEqual(etagFor(e.uid, { ...e.session, startTime: "19:00" }, e.date, e.endDate), base);
});

test("inTimeRange ignore une plage absente", () => {
  assert.equal(inTimeRange(events[0], null), true);
  assert.equal(inTimeRange(events[0], { start: null, end: null }), true);
});

// ─── Caractères interdits par XML ─────────────────────────────────────────────

test("un caractère de contrôle ne rend jamais la réponse mal formée", () => {
  // \x0B et \x1B n'ont aucun échappement en XML 1.0 : les laisser passer, c'est
  // livrer un document qu'un parseur strict refuse en bloc.
  const sale = "Bloc\u000B dur\u001B\u0000 !";
  assert.equal(hasXmlUnsafe(sale), true);
  assert.equal(stripXmlUnsafe(sale), "Bloc dur !");
  // eslint-disable-next-line no-control-regex -- on vérifie justement qu'il n'en reste aucun
  assert.equal(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(xe(sale)), false);
  // Ce qui est légal reste intact : tabulation, saut de ligne, accents, emoji
  // (donc une vraie paire de substituts).
  assert.equal(stripXmlUnsafe("a\tb\nc — é 🧗"), "a\tb\nc — é 🧗");
  assert.equal(hasXmlUnsafe("a\tb\nc — é 🧗"), false);
  // Une moitié de paire de substituts casse l'encodage : elle saute.
  assert.equal(hasXmlUnsafe("x\uD800y"), true);
  assert.equal(stripXmlUnsafe("x\uD800y"), "xy");
});

test("un .ics ne transporte pas de caractère de contrôle non plus", () => {
  const evt = { name: "Sortie\u000B longue", startTime: "07:00", duration: 60, notes: "note\u001Bx" };
  const ics = buildSingleICS("u@x", evt, new Date(Date.UTC(2026, 8, 14)), null);
  // eslint-disable-next-line no-control-regex -- on vérifie justement qu'il n'en reste aucun
  assert.equal(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(ics), false);
  assert.match(ics, /SUMMARY:Sortie longue/);
});

test("hasXmlUnsafe est réentrant (le drapeau /g ne doit pas mémoriser)", () => {
  // Un RegExp global garde `lastIndex` : sans remise à zéro, un appel sur deux
  // répondrait faux. C'est le genre de bug qui ne se voit qu'en production.
  assert.equal(hasXmlUnsafe("a\u000Bb"), true);
  assert.equal(hasXmlUnsafe("a\u000Bb"), true);
  assert.equal(hasXmlUnsafe("propre"), false);
  assert.equal(hasXmlUnsafe("propre"), false);
});

// ─── Diagnostic ───────────────────────────────────────────────────────────────

test("le diagnostic mesure sans recopier le contenu", () => {
  const d = diagnose({ planData: PLAN, events, ...CTX, syncToken: "urn:tp:sync:1" });
  assert.equal(d.ok, true);
  assert.equal(d.events.count, 3);
  assert.equal(d.row.weeks, 1);
  assert.equal(d.row.quickSessions, 1);
  assert.ok(d.row.blobBytes > 0);
  for (const k of ["icsFeed", "propfind0", "propfind1", "reportAll", "report90d"]) {
    assert.ok(d.responses[k].bytes > 0, k);
    assert.equal(d.responses[k].error, undefined, k);
  }
  // Les deux tailles sont là pour être comparées sur de vraies données : c'est
  // ce qui dit si une réponse approche du plafond de 4,5 Mo.
  assert.ok(d.limits.vercelPayloadBytes > 0);
  assert.equal(d.hrefs.bad, 0);
  assert.equal(d.xml.unsafeFields, 0);

  // Aucun nom de séance, aucune note, aucun lieu dans la sortie.
  const dump = JSON.stringify(d);
  for (const secret of ["Bloc & résistance", "Sortie longue", "Arkose Nation", "4x4", "Lyon"]) {
    assert.equal(dump.includes(secret), false, `fuite : ${secret}`);
  }
});

test("le diagnostic signale ce qui casserait un client", () => {
  const d = diagnose({
    planData: { weeks: { "2026-09-14": [[{ id: "c_x", name: "ok\u000Bsale", startTime: "10:00" }]] } },
    events: extractEvents({ weeks: { "2026-09-14": [[{ id: "c_x", name: "ok\u000Bsale", startTime: "10:00" }]] } }),
    ...CTX, syncToken: "urn:tp:sync:1",
  });
  assert.equal(d.xml.unsafeFields, 1);
});

test("un PROPFIND sans corps ne fabrique aucun .ics", () => {
  // allprop sur Depth:1 ne doit renvoyer que de quoi identifier les ressources.
  // Y mettre getcontentlength reviendrait à rendre tout le planning pour n'en
  // publier que des tailles.
  const xml = buildPropfind({ ...CTX, events, depth: "1", request: parseDavRequest("") });
  assert.equal(/BEGIN:VCALENDAR/.test(xml), false);
  assert.equal(/getcontentlength/.test(xml), false);
  assert.match(xml, /<D:getetag>/);

  // Mais elle reste servie à qui la demande.
  const asked = buildPropfind({ ...CTX, events, depth: "1",
    request: parseDavRequest('<propfind xmlns="DAV:"><prop><getcontentlength/></prop></propfind>') });
  assert.match(asked, /<D:getcontentlength>\d+<\/D:getcontentlength>/);
});

// ─── Routage ──────────────────────────────────────────────────────────────────

test("pathSegments lit les deux routes et l'URL brute", () => {
  // `caldav/[token]/[file].js` — la route qui manquait : en production, le
  // catch-all ne matchait qu'un seul segment et le .ics d'une séance renvoyait
  // la page 404 de Vercel, sans jamais atteindre la fonction.
  assert.deepEqual(pathSegments({ query: { token: "tok", file: "x.ics" } }), ["tok", "x.ics"]);
  assert.deepEqual(pathSegments({ query: { token: "tok" } }), ["tok"]);

  // `caldav/[...path].js` — tableau, ou chaîne quand il n'y a qu'un segment.
  assert.deepEqual(pathSegments({ query: { path: ["tok", "x.ics"] } }), ["tok", "x.ics"]);
  assert.deepEqual(pathSegments({ query: { path: "tok" } }), ["tok"]);

  // Dernier recours : l'URL brute, décodée, sans la chaîne de requête.
  assert.deepEqual(pathSegments({ query: {}, url: "/api/caldav/tok/x%40y.ics?diag=1" }), ["tok", "x@y.ics"]);
  assert.deepEqual(pathSegments({ url: "/api/caldav/tok/" }), ["tok"]);

  // Rien d'exploitable : aucun segment, et surtout aucune exception.
  assert.deepEqual(pathSegments({}), []);
  assert.deepEqual(pathSegments({ query: {}, url: "/ailleurs" }), []);
  assert.deepEqual(pathSegments({ query: { path: [] }, url: "" }), []);
});

test("un href publié se relit bien comme deux segments", () => {
  // La boucle complète : ce que PROPFIND publie doit revenir en (jeton, fichier)
  // quand le client va le chercher.
  for (const e of events) {
    const href = hrefFor(BASE, e.uid);
    const segs = pathSegments({ query: {}, url: href });
    assert.equal(segs.length, 2, href);
    assert.equal(uidFromHref(segs[1]), e.uid);
  }
});

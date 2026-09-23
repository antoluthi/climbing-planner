// Les cas tordus de la saisie en liste : curseur au milieu d'un mot, dans le
// marqueur, sur une ligne vide, avec une sélection. Tout cela se vérifie sans
// navigateur parce que `rich-text.js` ne touche pas au DOM — c'est la raison
// d'être de ce découpage.
//
//   node --test src/lib/rich-text.test.mjs
//
// Notation : dans les textes d'entrée, « | » marque le curseur. `at()` le
// retire et rend la position, pour que les cas se lisent comme ils s'écrivent.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseItem, indentWidth, handleEnter, handleTab, safeHref, hasRichSyntax } from "./rich-text.js";

const at = (s) => ({ value: s.replace("|", ""), pos: s.indexOf("|") });
const enter = (s) => { const { value, pos } = at(s); return handleEnter(value, pos); };
const tab = (s, dir = 1) => { const { value, pos } = at(s); return handleTab(value, pos, pos, dir); };

test("parseItem reconnaît les quatre marqueurs", () => {
  assert.equal(parseItem("- puce").marker, "-");
  assert.equal(parseItem("* puce").marker, "*");
  assert.equal(parseItem("3. étape").number, 3);
  assert.equal(parseItem("3) étape").number, 3);
  assert.equal(parseItem("[ ] tâche").checkbox, true);
  assert.equal(parseItem("[x] tâche").checkbox, true);
  assert.equal(parseItem("pas une liste"), null);
  // Un tiret sans espace n'est pas une puce : « 20-25 répétitions » non plus.
  assert.equal(parseItem("-collé"), null);
});

test("une tabulation vaut deux espaces", () => {
  assert.equal(indentWidth("    "), 4);
  assert.equal(indentWidth("\t"), 2);
  assert.equal(indentWidth("\t  "), 4);
});

test("Entrée continue une puce", () => {
  assert.deepEqual(enter("- pompes|"), { value: "- pompes\n- ", cursor: 11 });
});

test("Entrée continue une numérotée en incrémentant, séparateur compris", () => {
  assert.equal(enter("1. gainage|").value, "1. gainage\n2. ");
  assert.equal(enter("7) reprise|").value, "7) reprise\n8) ");
});

test("Entrée sur une case cochée en repose une vide", () => {
  assert.equal(enter("[x] magnésie|").value, "[x] magnésie\n[ ] ");
});

test("Entrée garde l'indentation de la ligne", () => {
  assert.equal(enter("  - prise large|").value, "  - prise large\n  - ");
});

test("Entrée coupe la ligne là où est le curseur", () => {
  assert.equal(enter("- pompes| et tractions").value, "- pompes\n-  et tractions");
});

test("Entrée sur un élément vide et indenté remonte d'un niveau", () => {
  assert.deepEqual(enter("    - |"), { value: "  - ", cursor: 4 });
});

test("Entrée sur un élément vide au premier niveau sort de la liste", () => {
  assert.deepEqual(enter("- pompes\n- |"), { value: "- pompes\n", cursor: 9 });
});

test("Entrée ne fait rien hors d'une liste, ni dans le marqueur, ni sur une sélection", () => {
  assert.equal(enter("du texte libre|"), null);
  assert.equal(enter("-| pompes"), null, "curseur dans le marqueur");
  assert.equal(handleEnter("- pompes", 2, 5), null, "sélection");
});

test("Tab imbrique, Maj+Tab désimbrique", () => {
  assert.equal(tab("- pompes|").value, "  - pompes");
  assert.equal(tab("    - pompes|", -1).value, "  - pompes");
  assert.equal(tab("\t- pompes|", -1).value, "- pompes", "tabulation collée d'ailleurs");
});

test("Maj+Tab ne descend pas sous le premier niveau", () => {
  assert.equal(tab("- pompes|", -1).value, "- pompes");
});

test("Tab rend null hors d'une liste — la touche garde son rôle", () => {
  assert.equal(tab("du texte libre|"), null);
});

test("Tab sur une sélection décale toutes les lignes de liste, et elles seules", () => {
  const v = "- a\ntexte\n- b";
  const r = handleTab(v, 0, v.length, 1);
  assert.equal(r.value, "  - a\ntexte\n  - b");
  assert.equal(r.selEnd, v.length + 4);
});

test("safeHref laisse passer http, https, mailto et www", () => {
  assert.equal(safeHref("https://exemple.fr/topo"), "https://exemple.fr/topo");
  assert.equal(safeHref("http://exemple.fr"), "http://exemple.fr");
  assert.equal(safeHref("mailto:coach@exemple.fr"), "mailto:coach@exemple.fr");
  assert.equal(safeHref("www.exemple.fr"), "https://www.exemple.fr");
});

test("safeHref refuse tout ce qui peut exécuter du code", () => {
  // Le planning d'un athlète est écrit par quelqu'un d'autre : un lien y est
  // du texte reçu, pas du texte de confiance.
  for (const bad of [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "exemple.fr",
    "",
    null,
  ]) assert.equal(safeHref(bad), null, `refusé : ${bad}`);
});

test("hasRichSyntax ne se déclenche que s'il y a vraiment de la mise en forme", () => {
  for (const plain of [
    "",
    "   ",
    "Sortie longue, allure 5:30/km",
    "20-25 répétitions",      // un tiret collé n'est pas une puce
    "note du 3*4 séries",     // une seule étoile n'ouvre rien
    "#sansespace",            // un dièse collé n'est pas un titre
  ]) assert.equal(hasRichSyntax(plain), false, `plat : ${JSON.stringify(plain)}`);

  for (const rich of [
    "# Titre",
    "- puce",
    "1. étape",
    "[ ] à faire",
    "du **gras** au milieu",
    "du ~~barré~~",
    "de l'*italique*",
    "du `code`",
    "un [lien](https://exemple.fr)",
    "texte\n- puce en seconde ligne",
  ]) assert.equal(hasRichSyntax(rich), true, `riche : ${JSON.stringify(rich)}`);
});

// node --test src/lib/color.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeHex, hexToHsl, hslToHex, withLightness } from "./color.js";

test("normalizeHex accepte les formes qu'on rencontre, refuse le reste", () => {
  assert.equal(normalizeHex("#FF4500"), "#ff4500");
  assert.equal(normalizeHex("FF4500"), "#ff4500");
  assert.equal(normalizeHex("#f40"), "#ff4400", "forme courte");
  assert.equal(normalizeHex("  #Ff4500 "), "#ff4500");
  assert.equal(normalizeHex("rouge"), "#888888", "repli");
  assert.equal(normalizeHex(null), "#888888");
  assert.equal(normalizeHex("#12345"), "#888888", "cinq chiffres ne sont pas une couleur");
});

test("les deux conversions se rendent la pareille", () => {
  // Régler puis relire sans y toucher doit rendre la même couleur : sinon la
  // teinte dérive un peu à chaque ouverture du sélecteur.
  for (const hex of ["#ff4500", "#000000", "#ffffff", "#808080", "#6b8a4a", "#3f7f84"]) {
    const { h, s, l } = hexToHsl(hex);
    const back = hslToHex(h, s, l);
    const d = Math.max(...[0, 2, 4].map(i =>
      Math.abs(parseInt(hex.slice(1 + i, 3 + i), 16) - parseInt(back.slice(1 + i, 3 + i), 16))));
    assert.ok(d <= 2, `${hex} → HSL → ${back} (écart ${d}, toléré 2)`);
  }
});

test("le gris n'a pas de teinte et le noir/blanc restent aux extrêmes", () => {
  assert.deepEqual(hexToHsl("#808080"), { h: 0, s: 0, l: 50 });
  assert.equal(hexToHsl("#000000").l, 0);
  assert.equal(hexToHsl("#ffffff").l, 100);
  assert.equal(hslToHex(210, 0, 50), "#808080", "saturation nulle → gris franc");
});

test("withLightness ne déplace que la luminosité", () => {
  const base = "#3f7f84";
  const { h, s } = hexToHsl(base);
  for (const l of [10, 35, 50, 72, 95]) {
    const out = hexToHsl(withLightness(base, l));
    // La luminosité, elle, est exacte : c'est le curseur qu'on déplace, il
    // doit rendre précisément ce qu'on lui demande.
    assert.equal(out.l, l, `luminosité demandée ${l}`);
    // La teinte, non — et ce n'est pas un défaut de la conversion. Aux
    // extrêmes, les trois canaux se resserrent (à L = 95 ils valent tous
    // ~240) : un arrondi d'une unité sur 255 y déplace la teinte de plusieurs
    // degrés. Invisible à l'œil, puisque la couleur y est presque blanche ou
    // presque noire. On tolère donc plus loin des bords qu'au milieu.
    const extreme = l < 20 || l > 80;
    assert.ok(Math.abs(out.h - h) <= (extreme ? 6 : 2), `teinte à L=${l} (${out.h} vs ${h})`);
    assert.ok(Math.abs(out.s - s) <= (extreme ? 4 : 2), `saturation à L=${l} (${out.s} vs ${s})`);
  }
});

test("hslToHex borne ce qu'on lui donne au lieu de produire une couleur absurde", () => {
  assert.equal(hslToHex(0, 100, 150), hslToHex(0, 100, 100), "luminosité > 100");
  assert.equal(hslToHex(0, -20, 50), hslToHex(0, 0, 50), "saturation négative");
  assert.equal(hslToHex(370, 100, 50), hslToHex(10, 100, 50), "teinte qui fait le tour");
  assert.equal(hslToHex(-10, 100, 50), hslToHex(350, 100, 50), "teinte négative");
});

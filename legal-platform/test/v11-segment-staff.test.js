// v11 segment-staff — واجهة الإدارة التي تفرّق بين «خيري» و«أفراد وشركات» (§10 في v11-spec، ST-0…ST-4 في build-1).
// اختبارات بلا متصفح: مكوّنات segment-ui.js على DOM مصغّر، فحص ثابت لصفحات المسار، وتكامل HTTP على بيانات العرض.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { startTestApp } from './helpers.js';
import { LABELS } from '../src/constants.js';
import { setMeta } from '../public/assets/js/lib/fmt.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const APP = 'public/assets/js/app/';

// ───────────────────────── DOM مصغّر (يكفي h() وui.js للمكوّنات) ─────────────────────────
function installDom() {
  class FakeNode {
    constructor() {
      this.parentNode = null;
      this.childNodes = [];
    }
    get firstChild() {
      return this.childNodes[0] || null;
    }
    get isConnected() {
      let n = this;
      while (n) {
        if (n === globalThis.document.body) return true;
        n = n.parentNode;
      }
      return false;
    }
    appendChild(c) {
      if (c.tagName === '#FRAGMENT') {
        for (const x of [...c.childNodes]) this.appendChild(x);
        return c;
      }
      if (c.parentNode) c.parentNode.removeChild(c);
      c.parentNode = this;
      this.childNodes.push(c);
      return c;
    }
    append(...cs) {
      for (const c of cs) this.appendChild(typeof c === 'string' ? globalThis.document.createTextNode(c) : c);
    }
    prepend(...cs) {
      const nodes = cs.map((c) => (typeof c === 'string' ? globalThis.document.createTextNode(c) : c));
      for (const n of nodes) if (n.parentNode) n.parentNode.removeChild(n);
      for (const n of nodes) n.parentNode = this;
      this.childNodes = [...nodes, ...this.childNodes];
    }
    after(...cs) {
      const p = this.parentNode;
      if (!p) return;
      const i = p.childNodes.indexOf(this);
      const nodes = cs.map((c) => (typeof c === 'string' ? globalThis.document.createTextNode(c) : c));
      for (const n of nodes) {
        if (n.parentNode) n.parentNode.removeChild(n);
        n.parentNode = p;
      }
      p.childNodes.splice(i + 1, 0, ...nodes);
    }
    replaceWith(n) {
      const p = this.parentNode;
      if (!p) return;
      p.childNodes[p.childNodes.indexOf(this)] = n;
      n.parentNode = p;
      this.parentNode = null;
    }
    removeChild(c) {
      this.childNodes = this.childNodes.filter((x) => x !== c);
      c.parentNode = null;
      return c;
    }
    remove() {
      this.parentNode?.removeChild(this);
    }
    get textContent() {
      return this.childNodes.map((c) => c.textContent).join('');
    }
    set textContent(v) {
      this.childNodes = [];
      if (v !== '' && v != null) this.appendChild(globalThis.document.createTextNode(v));
    }
  }
  class FakeText extends FakeNode {
    constructor(t) {
      super();
      this.data = String(t);
      this.tagName = '#TEXT';
    }
    get textContent() {
      return this.data;
    }
  }
  const parseSel = (sel) =>
    sel
      .split(',')
      .map((s) => s.trim().replace(/:not\([^)]*\)/g, '').replace(/:[\w-]+(\([^)]*\))?/g, ''))
      .filter(Boolean)
      .map((s) => {
        const tag = (/^[a-z]+/i.exec(s) || [''])[0];
        const classes = [...s.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
        const attrs = [...s.matchAll(/\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]/g)].map((m) => [m[1], m[2]]);
        return { tag, classes, attrs };
      });
  class FakeEl extends FakeNode {
    constructor(tag) {
      super();
      this.tagName = String(tag).toUpperCase();
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(this.tagName)) this.value = '';
      this.attrs = {};
      this.listeners = {};
      this.dataset = {};
      this.style = { setProperty() {} };
      const set = new Set();
      this.classList = {
        add: (...c) => c.forEach((x) => set.add(x)),
        remove: (...c) => c.forEach((x) => set.delete(x)),
        contains: (c) => set.has(c),
        toggle: (c, f) => ((f ?? !set.has(c)) ? set.add(c) : set.delete(c)),
        values: () => [...set],
      };
    }
    get children() {
      return this.childNodes.filter((c) => c instanceof FakeEl);
    }
    get className() {
      return this.classList.values().join(' ');
    }
    set className(v) {
      for (const c of String(v).split(/\s+/).filter(Boolean)) this.classList.add(c);
    }
    setAttribute(k, v) {
      this.attrs[k] = String(v);
      if (k === 'id') this.id = String(v);
      if (k === 'class') this.className = v;
    }
    getAttribute(k) {
      return k in this.attrs ? this.attrs[k] : null;
    }
    hasAttribute(k) {
      return k in this.attrs;
    }
    removeAttribute(k) {
      delete this.attrs[k];
    }
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    }
    removeEventListener(type, fn) {
      this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
    }
    dispatch(type, extra = {}) {
      const ev = { type, target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...extra };
      for (const fn of this.listeners[type] || []) fn(ev);
      return ev;
    }
    click() {
      if (this.tagName === 'INPUT' && (this.type === 'radio' || this.type === 'checkbox')) {
        this.checked = this.type === 'radio' ? true : !this.checked;
        this.dispatch('change');
      }
      return this.dispatch('click');
    }
    focus() {}
    blur() {}
    scrollIntoView() {}
    get type() {
      return this.attrs.type || '';
    }
    all() {
      return this.children.flatMap((c) => [c, ...c.all()]);
    }
    matchesOne(sel) {
      return parseSel(sel).some(
        (p) =>
          (!p.tag || this.tagName === p.tag.toUpperCase()) &&
          p.classes.every((c) => this.classList.contains(c)) &&
          p.attrs.every(([k, v]) => {
            const val = k.startsWith('data-') ? this.dataset[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] : this.attrs[k];
            return v === undefined ? val != null : String(val) === v;
          }),
      );
    }
    matches(sel) {
      // مجموعات بفواصل، وكل مجموعة سلسلة أسلاف بمسافات ('.a .b')
      return sel.split(',').some((group) => {
        const parts = group.trim().split(/\s+(?![^[]*\])/);
        if (!this.matchesOne(parts[parts.length - 1])) return false;
        let i = parts.length - 2;
        let n = this.parentNode;
        while (i >= 0 && n && n instanceof FakeEl) {
          if (n.matchesOne(parts[i])) i--;
          n = n.parentNode;
        }
        return i < 0;
      });
    }
    closest(sel) {
      let n = this;
      while (n && n instanceof FakeEl) {
        if (n.matches(sel)) return n;
        n = n.parentNode;
      }
      return null;
    }
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    }
    querySelectorAll(sel) {
      return this.all().filter((e) => e.matches(sel));
    }
  }
  const body = new FakeEl('body');
  globalThis.document = {
    body,
    activeElement: body,
    documentElement: new FakeEl('html'),
    createElement: (t) => new FakeEl(t),
    createElementNS: (ns, t) => new FakeEl(t),
    createTextNode: (t) => new FakeText(t),
    createDocumentFragment: () => new FakeEl('#fragment'),
    addEventListener() {},
    removeEventListener() {},
    querySelector: (s) => body.querySelector(s),
    querySelectorAll: (s) => body.querySelectorAll(s),
    getElementById: (id) => body.all().find((e) => e.id === id) || null,
  };
  globalThis.Node = FakeNode;
  for (const k of ['HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement']) globalThis[k] = class {};
  return { body, FakeEl };
}
function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const svgNames = (el) => el.all().filter((e) => e.tagName === 'SVG').map((e) => e.classList.values().find((c) => c.startsWith('icon-') && c !== 'icon-dir')?.slice(5));

/** fetch مزيّف يسجّل الطلبات ويرد JSON */
function stubFetch(reply = () => ({ status: 200, body: {} })) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null };
    calls.push(call);
    const r = reply(call);
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status || 200, headers: { 'content-type': 'application/json' } });
  };
  return calls;
}

let UI;
const realFetch = globalThis.fetch;
before(async () => {
  installDom();
  setMeta({ constants: { LABELS, ENUMS: {}, LEGAL_AREAS: [], GOVERNORATES: [] }, settings: {} });
  UI = await import('../public/assets/js/app/components/segment-ui.js');
});
after(() => {
  globalThis.fetch = realFetch;
});

// ───────────────────────── ST-0: عقد segment-ui.js ─────────────────────────
describe('v11 segment-staff — ST-0 segment-ui.js', () => {
  test('segmentChip: text + filled glyph per value, one colour code (gold charity, green paid/company, neutral unset), title = long label + source', () => {
    const cases = [
      [UI.segmentChip('charity', { source: 'website' }), 'خيري', 'heart', 'charity', 'خيري — مساعدة مجانية · اختيار الزائر في الموقع'],
      [UI.segmentChip('paid', { source: 'wa_line' }), 'أفراد', 'briefcase', 'paid', 'أفراد وشركات — خدمة بأتعاب · رقم واتساب المخصص'],
      [UI.segmentChip('paid', { company: true }), 'شركة', 'building', 'company', 'أفراد وشركات — خدمة بأتعاب'],
      [UI.segmentChip('paid', { requesterKind: 'company', source: 'company_lead' }), 'شركة — طلب عرض', 'building', 'company', 'أفراد وشركات — خدمة بأتعاب · نموذج طلب عرض للشركات'],
      [UI.segmentChip(null), 'غير محدد', 'helpCircle', 'unset', 'غير محدد'],
      [UI.segmentChip('bogus'), 'غير محدد', 'helpCircle', 'unset', 'غير محدد'],
    ];
    for (const [el, label, glyph, kind, title] of cases) {
      assert.equal(text(el), label);
      assert.deepEqual(svgNames(el), [glyph], `${label}: one glyph`);
      assert.ok(el.classList.contains('pill') && el.classList.contains('seg-chip') && el.classList.contains(`seg-chip--${kind}`), el.className);
      assert.ok(!/pill-(gold|warn|info|tint)/.test(el.className), 'the chip is styled by its own class, never a status pill');
      assert.equal(el.getAttribute('title'), title);
    }
    // legacy rows: source NULL on a charity row reads «قبل الإصدار 11 (خيري)»
    assert.match(UI.segmentChip('charity', { source: null }).getAttribute('title'), /قبل الإصدار 11 \(خيري\)/);
    // header size uses the filter label
    assert.equal(text(UI.segmentChip('paid', { size: 'label' })), 'أفراد وشركات');
    assert.equal(text(UI.segmentChip('charity', { size: 'long' })), 'خيري — مساعدة مجانية');
  });

  test('the hint, mismatch, line-mismatch and unknown-line pills are separate neutral pills (never the segment chip)', () => {
    const hint = UI.hintChip({ segment: 'paid', reasons: ['ذكر «شركتي»'] });
    assert.equal(text(hint), 'المقترح: أفراد وشركات');
    assert.ok(hint.classList.contains('pill-neutral') && !hint.classList.contains('seg-chip'));
    assert.equal(UI.hintChip(null), null);
    assert.equal(UI.hintChip({ segment: 'x' }), null);
    const mm = UI.mismatchChip({ segment: 'paid', reasons: ['ذكر «شركتي»', 'ذكر «عقد توريد»'] });
    assert.equal(text(mm), 'يبدو أفراد وشركات — ذكر «شركتي»، ذكر «عقد توريد»');
    assert.ok(mm.classList.contains('pill-neutral'));
    assert.equal(text(UI.lineMismatchChip('paid')), 'كتب على رقم الأفراد والشركات');
    assert.equal(text(UI.lineMismatchChip({ line: 'main' })), 'كتب على الرقم الأساسي');
    assert.equal(text(UI.lineMismatchChip({ line: 'paid', line_label: 'كتب على رقم الأفراد والشركات' })), 'كتب على رقم الأفراد والشركات');
    assert.equal(UI.lineMismatchChip(null), null);
    assert.equal(UI.unknownLineText('1234'), 'وصلت على رقم غير مضبوط (…1234)');
    assert.ok(UI.unknownLineChip('1234').classList.contains('pill-neutral'));
    // source text next to the header chip
    assert.equal(UI.sourceText({ value: 'paid', source: 'wa_line', source_label: 'رقم واتساب المخصص' }), 'رقم واتساب المخصص');
    assert.equal(UI.sourceText({ value: 'charity', source: null }), 'قبل الإصدار 11 (خيري)');
    assert.equal(UI.sourceText({ value: null, wa_line: 'main', wa_line_label: 'الرقم الأساسي' }), 'وصلت على الرقم الأساسي');
    assert.equal(UI.sourceText({ value: null, wa_line: 'unknown', wa_line_label: 'رقم غير مضبوط' }), null);
    assert.equal(UI.sourceLine({ value: 'paid', source_label: 'رقم واتساب المخصص' }), 'أفراد وشركات · رقم واتساب المخصص');
  });

  test('segmentSwitch: «الكل · خيري · أفراد وشركات · غير محدد», counts quiet, «غير محدد» counted only when > 0, compact = short labels without icons', () => {
    let picked = null;
    const sw = UI.segmentSwitch({ value: '', counts: { charity: 24, paid: 2, unset: 0 }, onChange: (v) => (picked = v) });
    assert.ok(sw.classList.contains('segmented') && sw.classList.contains('seg-switch'));
    assert.equal(sw.getAttribute('aria-label'), 'نوع الخدمة');
    const segs = sw.querySelectorAll('button.seg');
    assert.deepEqual(segs.map((b) => b.dataset.seg), ['all', 'charity', 'paid', 'unset']);
    assert.deepEqual(segs.map((b) => text(b.querySelector('.seg-l-full') || b.querySelector('.seg-l'))), ['الكل', 'خيري', 'أفراد وشركات', 'غير محدد']);
    assert.deepEqual(segs.map((b) => text(b.querySelector('.seg-n'))), ['26', '24', '2', '']);
    assert.equal(segs[0].getAttribute('aria-pressed'), 'true');
    assert.equal(segs[2].getAttribute('aria-label'), 'أفراد وشركات (2)', 'the short label is aria-hidden; the button names the full label');
    segs[3].click();
    assert.equal(picked, 'unset');
    assert.equal(sw.querySelector('[data-seg="unset"]').getAttribute('aria-pressed'), 'true');
    sw.update({ counts: { charity: 1, paid: 0, unset: 3 } });
    assert.equal(text(sw.querySelector('[data-seg="unset"] .seg-n')), '3');
    const compact = UI.segmentSwitch({ counts: { charity: 1, paid: 2, unset: 1 }, compact: true });
    assert.deepEqual(compact.querySelectorAll('.seg-l').map(text), ['الكل', 'خيري', 'أفراد', 'غير محدد']);
    assert.equal(compact.querySelectorAll('svg').length, 0, 'compact: no icons');
    assert.ok(compact.classList.contains('is-compact'));
  });

  test('sendHeader (r2 P13): chip + tone + «سيُرسل من: …» always, even without a paid line', () => {
    const paid = UI.sendHeader({ segment: 'paid', tone: 'paid', sendLine: { key: 'paid', label: 'رقم الأفراد والشركات' } });
    assert.ok(paid.classList.contains('send-head'));
    assert.equal(text(paid.querySelector('.seg-chip')), 'أفراد وشركات');
    assert.equal(text(paid.querySelector('.send-head-tone')), 'بأسلوب الأفراد والشركات');
    assert.equal(text(paid.querySelector('.send-head-line')), 'سيُرسل من: رقم الأفراد والشركات');
    const main = UI.sendHeader({ segment: 'charity', tone: 'charity', sendLine: { key: 'main', label: 'الرقم الأساسي' } });
    assert.equal(text(main.querySelector('.send-head-line')), 'سيُرسل من: الرقم الأساسي');
    assert.equal(text(main.querySelector('.send-head-tone')), 'بأسلوب الخيري');
    const neutral = UI.sendHeader({ segment: null, sendLine: null });
    assert.equal(text(neutral.querySelector('.seg-chip')), 'غير محدد');
    assert.equal(text(neutral.querySelector('.send-head-tone')), 'بأسلوب محايد');
    assert.equal(text(neutral.querySelector('.send-head-line')), 'سيُرسل من: صفحة المتابعة');
    assert.equal(text(UI.sendHeader({ segment: 'paid', company: true }).querySelector('.seg-chip')), 'شركة');
  });

  test('override sheet (S11-39, r2 S14/S21): reason required only from a set value, quick-fill reason chips, message prefilled by direction and unticked, the no-amount note', () => {
    const msg = { charity: 'نص التحويل إلى الخيري', paid: 'نص التحويل إلى الأفراد' };
    const b = UI.segmentSheetBody({ kind: 'intake', current: 'charity', changeMessage: msg });
    const host = document.createElement('div');
    host.appendChild(b.el);
    assert.match(text(host), /لن يُطلب أي مبلغ إلا بموافقة صريحة من العميل على صفحة طلبه\./);
    assert.deepEqual(b.controls.radios.map(text), ['خيري — مساعدة مجانية', 'أفراد وشركات — خدمة بأتعاب']);
    assert.equal(b.controls.sendCb.checked, undefined, 'the client message is never ticked by default');
    b.controls.radios[1].querySelector('input').click();
    assert.equal(b.controls.msg.value, 'نص التحويل إلى الأفراد', 'prefill follows the direction');
    assert.equal(b.payload(), null, 'a set value needs a reason');
    assert.match(text(host), /اكتبوا سبب التغيير\./);
    assert.deepEqual(b.controls.reasonChips.querySelectorAll('button').map(text), ['غير مستحق للخيري', 'اختار النوع الخطأ', 'طلب شركة']);
    b.controls.reasonChips.querySelector('[data-code="company"]').click();
    assert.deepEqual(b.payload(), { segment: 'paid', reason: 'طلب شركة', reason_code: 'company' });
    b.controls.sendCb.checked = true;
    b.controls.sendCb.dispatch('change');
    assert.deepEqual(b.payload(), { segment: 'paid', reason: 'طلب شركة', reason_code: 'company', message: { send: true, text: 'نص التحويل إلى الأفراد' } });
    assert.ok(b.isDirty());
    // from «غير محدد»: no reason asked, no message block
    const n = UI.segmentSheetBody({ kind: 'intake', current: null });
    assert.equal(n.payload(), null, 'nothing chosen');
    n.controls.radios[0].querySelector('input').click();
    assert.deepEqual(n.payload(), { segment: 'charity' });
    const nh = document.createElement('div');
    nh.appendChild(n.el);
    assert.equal(nh.querySelector('.seg-msg-block'), null);
    assert.equal(UI.afterChangeNotes({ affected_periods: ['2026-09', '2026-10'] })[0], 'الفترات المغلقة لم تتغير: 2026-09، 2026-10');
    assert.equal(UI.afterChangeNotes({ cancelled_invoices: [{ id: 1 }] })[0], 'أُلغيت فاتورة أتعاب واحدة لم تُدفع.');
    assert.equal(UI.afterChangeNotes({ cancelled_invoices: [1, 2] })[0], 'أُلغيت فاتورتا أتعاب لم تُدفعا.');
  });

  test('segmentChoice (story sheet): no default when required, «سيُسجَّل تغيير نوع الخدمة.» only on a change from a set value', () => {
    let got = null;
    const req = UI.segmentChoice({ required: true, hint: { segment: 'paid', reasons: ['x'] }, onChange: (v) => (got = v) });
    assert.equal(req.getValue(), null);
    assert.equal(req.querySelectorAll('input').filter((i) => i.checked).length, 0, 'no default');
    assert.equal(text(req.querySelector('.seg-hint')), 'المقترح: أفراد وشركات');
    req.querySelectorAll('input')[0].click();
    assert.equal(got, 'charity');
    assert.equal(req.getValue(), 'charity');
    const set = UI.segmentChoice({ value: 'charity', current: 'charity' });
    const note = set.querySelector('.seg-choice-note');
    assert.equal(note.hidden, true);
    set.querySelectorAll('input')[1].click();
    assert.equal(note.hidden, false);
    assert.equal(text(note), 'سيُسجَّل تغيير نوع الخدمة.');
  });

  test('undeterminedCard (r2 S21): two big buttons, the hint with «استخدم الاقتراح», the analysis line; one tap saves with no reason', async () => {
    const calls = stubFetch(() => ({ status: 200, body: { value: 'paid', unchanged: false } }));
    let saved = null;
    const card = UI.undeterminedCard({ id: 46, hint: { segment: 'paid', reasons: ['ذكر «شركتي» و«عقد توريد»'] } }, (v) => (saved = v));
    assert.equal(text(card.querySelector('.seg-card-title')), 'نوع الخدمة غير محدد');
    assert.deepEqual(card.querySelectorAll('.seg-card-btn').map(text), ['خيري — مساعدة مجانية', 'أفراد وشركات — خدمة بأتعاب']);
    assert.match(text(card.querySelector('.seg-card-hint')), /^المقترح: أفراد وشركات — ذكر «شركتي» و«عقد توريد»\s?استخدم الاقتراح$/);
    assert.equal(text(card.querySelector('.seg-card-note')), 'لا يتغير التحليل؛ يتغير أسلوب الرسائل والحسابات فقط.');
    card.querySelector('.seg-card-use').click();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'PUT');
    assert.equal(calls[0].url, '/api/admin/intakes/46/segment');
    assert.deepEqual(calls[0].body, { segment: 'paid' }, 'no reason from «غير محدد»');
    assert.equal(saved, 'paid');
    // a card with no hint has no «استخدم الاقتراح»
    assert.equal(UI.undeterminedCard({ id: 1, hint: null }).querySelector('.seg-card-use'), null);
  });

  test('cases/matters filter «الكل · خيري · أفراد · شركات» maps to segment/line exactly (ST-4)', () => {
    assert.deepEqual(UI.CASE_SEGMENT_FILTERS.map((f) => f.label), ['الكل', 'خيري', 'أفراد', 'شركات']);
    assert.deepEqual(UI.caseFilterQuery(''), {});
    assert.deepEqual(UI.caseFilterQuery('charity'), { segment: 'charity' });
    assert.deepEqual(UI.caseFilterQuery('paid'), { segment: 'paid', line: 'b2c' });
    assert.deepEqual(UI.caseFilterQuery('company'), { line: 'b2b' });
    assert.equal(UI.caseFilterKey({ segment: 'charity' }), 'charity');
    assert.equal(UI.caseFilterKey({ segment: 'paid', line: 'b2c' }), 'paid');
    assert.equal(UI.caseFilterKey({ line: 'b2b' }), 'company');
    assert.equal(UI.caseFilterKey({ seg: 'company' }), 'company');
    assert.equal(UI.caseFilterKey({}), '');
    const sw = UI.caseSegmentSwitch({ value: 'paid' });
    assert.deepEqual(sw.querySelectorAll('button.seg').map((b) => b.getAttribute('aria-pressed')), ['false', 'false', 'true', 'false']);
    assert.deepEqual(svgNames(sw), ['heart', 'briefcase', 'building']);
  });

  test('«إضافة أتعاب» sheet (r2 P5): المبلغ · الوصف · تاريخ الاستحقاق, validation, payload; the fee list comes from the case activity', () => {
    const b = UI.feeSheetBody();
    const host = document.createElement('div');
    host.appendChild(b.el);
    assert.deepEqual(host.querySelectorAll('.field-label').map((l) => text(l).replace('*', '').trim()), ['المبلغ', 'الوصف', 'تاريخ الاستحقاق']);
    assert.equal(b.payload(), null);
    assert.match(text(host), /اكتبوا مبلغًا صحيحًا/);
    b.controls.amount.value = '١٥٠٠';
    b.controls.due.value = '2026-10-20';
    const p = b.payload();
    assert.equal(p.amount, 1500);
    assert.match(p.due_at, /^2026-10-20T2\d:59:59/);
    assert.equal(p.description, undefined, 'server default «أتعاب استشارة قانونية»');
    const acts = [
      { type: 'invoice.created', data: { invoice_id: 3, case_fee: true }, summary: 'أُصدرت أتعاب مقترحة INV-1' },
      { type: 'invoice.created', data: { invoice_id: 4, case_fee: true }, summary: 'أُصدرت أتعاب مقترحة INV-2' },
      { type: 'invoice.created', data: { invoice_id: 9 }, summary: 'فاتورة ملف مستمر' },
      { type: 'invoice.client_response', data: { invoice_id: 3, answer: 'agree' } },
      { type: 'invoice.cancelled', data: { invoice_id: 4 } },
    ];
    const items = UI.caseFeeItems(acts, [{ id: 3, number: 'INV-2026-00003', amount: 2500, status: 'unpaid' }]);
    assert.deepEqual(items.map((x) => [x.id, x.number, x.agreed, x.cancelled]), [[3, 'INV-2026-00003', true, false], [4, null, false, true]]);
    assert.equal(UI.feesStateText({ invoices: 1, agreed: false }), 'لم يوافق العميل على الأتعاب بعد');
  });

  test('v11-segment.css: tokens only, ≤ 2 KB br, one colour code; H-T1 link right after v11-ui.css; notif icons', async () => {
    const css = read('public/assets/css/v11-segment.css');
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(body, /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i, 'no colour literals');
    const br = zlib.brotliCompressSync(Buffer.from(css)).length;
    assert.ok(br <= 2048, `v11-segment.css ${br} B br`);
    assert.match(body, /\.seg-chip--charity \{ background: var\(--gold-wash\); color: var\(--gold-ink\); \}/);
    assert.match(body, /\.seg-chip--paid, \.seg-chip--company \{ background: var\(--tint-weak\); color: var\(--tint\); \}/);
    assert.match(body, /\.seg-chip--unset \{[^}]*background: var\(--fill-2\);[^}]*dashed/);
    assert.match(body, /@media \(max-width: 599px\)[\s\S]*\.seg-switch \.seg-l-short \{ display: inline; \}/, 'compact switch below 600 px');
    const html = read('public/app.html');
    assert.match(html, /<link rel="stylesheet" href="\/assets\/css\/v11-ui\.css" \/>\n {4}<link rel="stylesheet" href="\/assets\/css\/v11-segment\.css" \/>/);
    const { notifIcon } = await import('../public/assets/js/app/notif.js');
    assert.equal(notifIcon('intake.company_lead'), 'building');
    assert.equal(notifIcon('segment.changed'), 'edit');
  });
});

// ───────────────────────── ST-1: صندوق الوارد ─────────────────────────
describe('v11 segment-staff — ST-1 inbox', () => {
  const ITEMS = [
    { id: 1, code: 'REQ-1', status: 'new', contact_name: 'أم يوسف', first_channel: 'website', channels: ['website'], source: 'google', segment: 'charity', segment_source: 'website', identity_unconfirmed: true, ai: { track: 'consultation', one_line: 'ورث' }, story: { view: 'ready', voice: { missing: 1 } }, created_at: '2026-10-09T06:00:00Z' },
    { id: 2, code: 'REQ-2', status: 'new', contact_name: 'أ. هشام', first_channel: 'website', channels: ['website'], source: 'direct', segment: 'paid', segment_source: 'company_lead', requester_kind: 'company', ai: { track: 'need_info' }, story: { view: 'ready' }, created_at: '2026-10-09T05:00:00Z' },
    { id: 3, code: 'REQ-3', status: 'new', contact_name: 'عميل', first_channel: 'whatsapp', channels: ['whatsapp'], source: 'direct', segment: null, segment_hint: { segment: 'paid', reasons: ['ذكر «شركتي»'] }, wa_line: 'main', story: { view: 'ready' }, created_at: '2026-10-09T04:00:00Z' },
    { id: 4, code: 'REQ-4', status: 'new', contact_name: 'أم سلمى', first_channel: 'whatsapp', channels: ['whatsapp'], source: 'direct', segment: 'charity', segment_hint: { segment: 'paid', reasons: ['ذكر «محل»'] }, line_mismatch: { line: 'paid' }, story: { view: 'ready' }, created_at: '2026-10-09T03:00:00Z' },
  ];
  let page;
  before(async () => {
    globalThis.window = { localStorage: memoryStorage(), location: { hash: '#/inbox', pathname: '/app', search: '' }, history: { replaceState() {} }, matchMedia: () => ({ matches: false }) };
    stubFetch((c) => (c.url.startsWith('/api/admin/intakes') ? { body: { total: 4, counts: { new: 4 }, story_counts: { ready: 4 }, segment_counts: { charity: 2, paid: 1, unset: 1 }, items: ITEMS } } : { body: {} }));
    const mod = await import('../public/assets/js/app/pages/admin/inbox.js');
    page = await mod.default({ query: {}, params: {}, user: { id: 1, role: 'admin' }, navigate() {}, reload() {} });
  });
  after(() => {
    delete globalThis.window;
  });

  test('the switch shows the server counts and «غير محدد»; every triage card carries its chip next to the name (text + icon)', () => {
    const sw = page.querySelector('.pa-segbar .seg-switch');
    assert.deepEqual(sw.querySelectorAll('.seg-n').map(text), ['4', '2', '1', '1']);
    const cards = page.querySelectorAll('article.pa-story');
    assert.equal(cards.length, 4);
    assert.deepEqual(cards.map((c) => text(c.querySelector('.pa-story-head .seg-chip'))), ['خيري', 'شركة — طلب عرض', 'غير محدد', 'خيري']);
    for (const c of cards) assert.equal(svgNames(c.querySelector('.seg-chip')).length, 1);
  });

  test('r2 P12: inside a triage card no gold/warn/info pill but the segment chip; AI and warning pills are neutral with an icon', () => {
    for (const c of page.querySelectorAll('article.pa-story')) {
      const coloured = c.all().filter((e) => /\bpill-(gold|warn)\b/.test(e.className) || /\bbadge-(warning|accent)\b/.test(e.className));
      assert.deepEqual(coloured.map((e) => e.className), [], `card ${c.dataset.id}`);
    }
    const first = page.querySelector('article.pa-story');
    const neutral = first.querySelectorAll('.pill-neutral').map(text);
    assert.ok(neutral.includes('رقم غير مؤكد') && neutral.includes('المقترح: استشارة') && neutral.includes('1 لم تُكتب'), neutral.join(' | '));
    const unset = page.querySelectorAll('article.pa-story')[2];
    assert.ok(unset.querySelector('.seg-hint'), 'hint as a separate neutral pill');
    const mismatch = page.querySelectorAll('article.pa-story')[3];
    assert.equal(text(mismatch.querySelector('.seg-mismatch')), 'يبدو أفراد وشركات — ذكر «محل»');
    assert.equal(text(mismatch.querySelector('.seg-line')), 'كتب على رقم الأفراد والشركات');
  });

  test('r2 P21: «تصفية» pill and a «+» named «تسجيل طلب يدوي»; large title + one count line; the segment travels in ?segment= and bm.inbox.seg', () => {
    const pill = page.querySelector('.pa-filter-pill');
    assert.ok(pill && text(pill) === 'تصفية' && pill.getAttribute('aria-haspopup') === 'dialog');
    const plus = page.querySelector('.pa-manual-btn');
    assert.equal(plus.getAttribute('aria-label'), 'تسجيل طلب يدوي');
    assert.equal(svgNames(plus)[0], 'plus');
    assert.match(text(page.querySelector('.pa-count-line')), /^4 طلبات مفتوحة · جاهزة للقرار: 4$/);
    const src = read(`${APP}pages/admin/inbox.js`);
    assert.match(src, /const SEG_KEY = 'bm\.inbox\.seg';/);
    assert.match(src, /segment: state\.seg \|\| undefined/);
    assert.match(src, /SEG_FILTERS\.includes\(ctx\.query\.segment\) \? ctx\.query\.segment : readSeg\(\)/);
    assert.match(src, /try \{\s*const v = window\.localStorage\.getItem\(SEG_KEY\);/);
    // manual entry: «نوع الخدمة» radios, required, no default
    assert.match(src, /name: 'manual-segment',[\s\S]{0,40}required: true,/);
    assert.doesNotMatch(src.slice(src.indexOf('async function manualIntake')), /checked: true/);
    assert.match(src, /segment: manualSeg,/);
  });
});

// ───────────────────────── ST-2…ST-4: الصفحات (فحص ثابت) ─────────────────────────
describe('v11 segment-staff — ST-2…ST-4 page wiring', () => {
  test('request page: header chip + source + «تغيير» (or «غيّروا نوع الخدمة من صفحة الملف.»), the undetermined card first, send header on the composer and the AI reply, unknown line = portal only, beneficiary hidden for paid, requester block', () => {
    const src = read(`${APP}pages/admin/intake-detail.js`);
    assert.match(src, /meta: \[\n\s*segHead\(\),/);
    assert.match(src, /seg\.can_change !== false\n\s*\? button\('تغيير'/);
    assert.match(src, /ON_CASE_HINT/);
    assert.match(src, /!segValue && seg\.can_change !== false \? undeterminedCard\(/);
    assert.match(src, /sendHeader\(sendInfo\),/);
    assert.match(src, /ai: \{ intakeId: it\.id, sendInfo \}/);
    assert.match(src, /unknownLine \? REPLY_CHANNELS\.filter\(\(o\) => o\.value === 'website'\)/);
    assert.match(src, /it\.client_id && !isPaid && withId\(beneficiaryCard/);
    assert.match(src, /'إضافة كشركة عميلة'/);
    assert.match(src, /new URLSearchParams\(\{ new: '1', name: requester\.company_name/);
    assert.match(read(`${APP}components/ai-reply.js`), /sendInfo \? sendHeader\(sendInfo\) : null/);
  });

  test('story sheet: required no-default choice when segment_required, submit disabled until chosen, segment sent, 409 inline, eligibility notice; send-document header', () => {
    const src = read(`${APP}components/story-sheet.js`);
    assert.match(src, /const segRequired = Boolean\(p\.segment_required\) \|\| !segNow;/);
    assert.match(src, /disabled: !segPick,/);
    assert.match(src, /submitBtn\.disabled = !segPick;/);
    assert.match(src, /if \(segPick && segPick !== segNow\) body\.segment = segPick;/);
    assert.match(src, /if \(err\.code === 'segment_required'\) segPicker\.setError\(REQUIRED_TEXT\);/);
    assert.match(src, /'لم تُسجَّل بيانات الأسرة — تأكدوا من الاستحقاق'/);
    assert.match(src, /headHost,\n\s*segBlock,/);
    const sd = read(`${APP}components/send-document.js`);
    assert.match(sd, /if \(sendInfo\) f\.el\.prepend\(sendHeader\(sendInfo\)\);/);
    assert.match(read(`${APP}pages/admin/case-detail.js`), /sendDocumentButton\(d, \{ onSent: \(\) => refresh\(null, \{ tab: 'documents' \}\), sendInfo \}\)/);
    assert.match(read(`${APP}pages/admin/matter-detail.js`), /sendDocumentButton\(x, \{ onSent: \(\) => refresh\(null, \{ tab: 'documents' \}\), sendInfo \}\)/);
  });

  test('case page: chip + «تغيير» (kind case), paid individual: no programme field, «الأتعاب» card with «إضافة أتعاب», soft fee warning on the page and the assign sheet, no pro_bono option', () => {
    const src = read(`${APP}pages/admin/case-detail.js`);
    assert.match(src, /openSegmentSheet\(\{\n\s*kind: 'case',/);
    assert.match(src, /paidIndividual \? null : company \? null : \['برنامج التمويل', caseProgramField/);
    assert.match(src, /button\('إضافة أتعاب', \{ size: 'sm', icon: 'plus', onClick: \(\) => openFeeSheet\(\{ caseId: c\.id/);
    assert.equal((src.match(/feesPending && h\('p\.notice-warn\.seg-fees-warn'/g) || []).length, 2, 'case page + assign sheet');
    assert.match(src, /paidIndividual \? options\('fee_mode'\)\.filter\(\(o\) => o\.value !== 'pro_bono'\)/);
    assert.match(src, /sendInfo, \/\/ v11 segment-staff \(r2 P13\)/);
    const ui = read(`${APP}components/segment-ui.js`);
    assert.match(ui, /title: 'إضافة أتعاب لهذا الملف'/);
    assert.match(ui, /label: 'إرسال للعميل للموافقة'/);
    assert.match(ui, /api\.post\(`\/admin\/cases\/\$\{encodeURIComponent\(caseId\)\}\/invoices`, payload\)/);
    for (const f of ['cases.js', 'matters.js']) assert.match(read(`${APP}pages/admin/${f}`), /caseSegmentSwitch\(\{/, f);
  });

  test('lawyers see nothing (INV-02): no segment word, key or chip in pages/lawyer/* or lawyer-shell.js', () => {
    const files = fs.readdirSync(path.join(ROOT, `${APP}pages/lawyer`)).filter((f) => f.endsWith('.js')).map((f) => `${APP}pages/lawyer/${f}`);
    files.push(`${APP}lawyer-shell.js`);
    for (const f of files) {
      const src = read(f);
      for (const w of ['خيري', 'أفراد وشركات', 'غير محدد', 'segment-ui']) assert.ok(!src.includes(w), `${f}: «${w}»`);
      assert.doesNotMatch(src, /\bsegment\b/, `${f}: segment`);
    }
  });
});

// ───────────────────────── تكامل HTTP على بيانات العرض ─────────────────────────
describe('v11 segment-staff — the endpoints the UI drives (demo seed)', () => {
  let t;
  let admin;
  let manager;
  before(async () => {
    globalThis.fetch = realFetch;
    t = await startTestApp({ seed: 'demo' });
    admin = await t.login('admin');
    manager = await t.login('manager');
  });
  after(async () => {
    await t?.close();
  });

  test('switch counts == list totals per segment (open intakes), and «غير محدد» lists the NULL demo request', async () => {
    const all = await admin.get('/api/admin/intakes?scope=open&limit=200');
    assert.equal(all.status, 200);
    const counts = all.body.segment_counts;
    for (const k of ['charity', 'paid', 'unset']) {
      const r = await admin.get(`/api/admin/intakes?scope=open&segment=${k}&limit=200`);
      assert.equal(r.body.total, counts[k], k);
      for (const it of r.body.items) assert.equal(it.segment ?? 'unset', k === 'unset' ? 'unset' : k);
    }
    assert.ok(counts.unset >= 1);
    assert.equal(counts.charity + counts.paid + counts.unset, all.body.total);
  });

  test('cases filter mapping: خيري → charity only, أفراد → paid non-company, شركات → company only', async () => {
    const q = async (qs) => (await admin.get(`/api/admin/cases?${qs}&limit=500`)).body.items;
    for (const c of await q('segment=charity')) assert.ok(c.segment === 'charity' && !c.company_id, c.code);
    const paid = await q('segment=paid&line=b2c');
    assert.ok(paid.length >= 1);
    for (const c of paid) assert.ok(c.segment === 'paid' && !c.company_id, c.code);
    const co = await q('line=b2b');
    assert.ok(co.length >= 1);
    for (const c of co) assert.ok(c.company_id, c.code);
  });

  test('one tap from «غير محدد» needs no reason; a set value needs one («اكتبوا سبب التغيير.»); same value is a no-op', async () => {
    const list = await admin.get('/api/admin/intakes?scope=open&segment=unset&limit=50');
    const id = list.body.items[0].id;
    const r1 = await manager.put(`/api/admin/intakes/${id}/segment`, { segment: 'paid' });
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    assert.equal(r1.body.value, 'paid');
    const r2 = await manager.put(`/api/admin/intakes/${id}/segment`, { segment: 'charity' });
    assert.equal(r2.status, 400);
    assert.equal(r2.body.error, 'اكتبوا سبب التغيير.');
    const r3 = await manager.put(`/api/admin/intakes/${id}/segment`, { segment: 'charity', reason: 'غير مستحق للخيري', reason_code: 'not_eligible' });
    assert.equal(r3.status, 200);
    const r4 = await manager.put(`/api/admin/intakes/${id}/segment`, { segment: 'charity' });
    assert.equal(r4.status, 200);
    assert.equal(r4.body.unchanged, true);
  });

  test('«إضافة أتعاب» → case fees pending; assigning a lawyer before agreement warns (fees_not_agreed) and never blocks', async () => {
    const cases = (await admin.get('/api/admin/cases?segment=charity&limit=500')).body.items.filter((c) => c.status !== 'closed' && !c.lead_name);
    const c = cases[0] || (await admin.get('/api/admin/cases?segment=charity&limit=500')).body.items.find((x) => x.status !== 'closed');
    const sw = await admin.put(`/api/admin/cases/${c.id}/segment`, { segment: 'paid', reason: 'اختار النوع الخطأ', reason_code: 'wrong_choice' });
    assert.equal(sw.status, 200, JSON.stringify(sw.body));
    const inv = await manager.post(`/api/admin/cases/${c.id}/invoices`, { amount: 1500, due_at: new Date(Date.now() + 7 * 864e5).toISOString() });
    assert.equal(inv.status, 201, JSON.stringify(inv.body));
    assert.equal(inv.body.invoice?.agreed ?? inv.body.agreed, false);
    const d = await manager.get(`/api/admin/cases/${c.id}`);
    assert.equal(d.body.segment.value, 'paid');
    assert.deepEqual(d.body.fees, { invoices: 1, agreed: false });
    assert.equal(d.body.send_line.label.length > 0, true, '«سيُرسل من» always has a line');
    const acts = d.body.activity.filter((a) => a.type === 'invoice.created' && a.data && a.data.case_fee);
    assert.equal(acts.length, 1, 'the fee list is built from the case activity');
    const lawyers = (await manager.get(`/api/admin/cases/${c.id}/suggest-lawyers`)).body.items;
    const a = await manager.post(`/api/admin/cases/${c.id}/assignments`, { lawyer_id: lawyers[0].id, role: 'specialist', brief: 'إبداء الرأي في المسألة المعروضة بالتفصيل.', fee_mode: 'agreement', grants: { facts: true } });
    assert.equal(a.status, 201, JSON.stringify(a.body));
    assert.ok((a.body.warning_codes || []).includes('fees_not_agreed'));
    assert.ok((a.body.warnings || []).includes('لم يوافق العميل على الأتعاب بعد'));
  });
});

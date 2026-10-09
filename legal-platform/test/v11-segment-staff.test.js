// v11 segment-staff — واجهة الإدارة التي تفرّق بين «خيري» و«أفراد وشركات» (§10 في v11-spec، ST-0…ST-4 في build-1، ST-5…ST-7 في build-2).
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

// ───────────────────────── ST-5…ST-7 (build-2): صفحات اللوحة والإعدادات والمحاكي على DOM مصغّر ─────────────────────────
const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle(n = 6) {
  for (let i = 0; i < n; i++) await tick();
}
function withWindow(hash = '#/') {
  globalThis.window = { localStorage: memoryStorage(), location: { hash, pathname: '/app', search: '' }, history: { replaceState() {} }, matchMedia: () => ({ matches: false }), getComputedStyle: () => ({ direction: 'rtl' }), requestAnimationFrame: (f) => (f(), 0) };
  globalThis.requestAnimationFrame = (f) => (f(), 0);
}
function dropWindow() {
  delete globalThis.window;
  delete globalThis.requestAnimationFrame;
}

const DASH = {
  intakes: { new: 3, in_review: 1, awaiting_client: 0, today: 2, urgent: 1 },
  cases: { new: 1, closed: 2 },
  open_cases: 5,
  pending_decisions: {},
  overdue_assignments: 0,
  upcoming_events: [],
  overdue_invoices: 0,
  failed_messages: 0,
  similar_alerts: [],
  knowledge_pending: 0,
  sla: null,
  capacity: { capacity: 10, open_assignments: 2, top_loaded: [] },
  cases_scope_label: 'يشمل الخيري والأفراد',
  month: { period: '2026-10', cases_opened: 4, cases_closed: 1, lawyer_cost: 1200, pro_bono: 2, paid: { cases_opened: 2, cases_closed: 0, lawyer_cost: 1500 } },
  segments: { charity: { new_today: 3, open: 24 }, paid: { new_today: 1, open: 2, unconfirmed_wa: 2, revenue_month: 2500 }, unset_open: 1, ineligible_overrides: 1 },
  weekly: [],
  ai: { label: 'محلي', provider: 'heuristic' },
  whatsapp: { state: 'simulation' },
  user: { name: 'كريم منصور', role: 'admin' },
};

describe('v11 segment-staff — ST-5 dashboard, impact, analytics, accounting', () => {
  let DashMod;
  before(async () => {
    withWindow('#/dashboard');
    DashMod = await import('../public/assets/js/app/pages/admin/dashboard.js');
  });
  after(() => dropWindow());

  test('«حسب نوع الخدمة»: «خيري» / «أفراد وشركات» rows «جديد اليوم n · مفتوح n» → the filtered inbox; gold heart vs green briefcase; revenue only when the server sends it', () => {
    const strip = DashMod.segmentStrip(DASH.segments);
    assert.equal(text(strip.querySelector('.g-head')), 'حسب نوع الخدمة');
    const rows = strip.querySelectorAll('a.pa-seg-row');
    assert.equal(rows[0].getAttribute('href'), '#/inbox?segment=charity');
    assert.equal(text(rows[0].querySelector('.g-title')), 'خيري');
    assert.equal(text(rows[0].querySelector('.pa-seg-line')), 'جديد اليوم 3 · مفتوح 24');
    assert.ok(rows[0].querySelector('.g-ico').classList.contains('is-gold'));
    assert.equal(svgNames(rows[0].querySelector('.g-ico'))[0], 'heart');
    assert.equal(rows[1].getAttribute('href'), '#/inbox?segment=paid');
    assert.equal(text(rows[1].querySelector('.g-title')), 'أفراد وشركات');
    assert.equal(text(rows[1].querySelector('.pa-seg-line')), 'جديد اليوم 1 · مفتوح 2');
    assert.ok(!rows[1].querySelector('.g-ico').classList.contains('is-gold'), 'paid = the green tint, never gold');
    assert.equal(svgNames(rows[1].querySelector('.g-ico'))[0], 'briefcase');
    assert.match(text(rows[1].querySelector('.pa-seg-rev')), /^إيرادات الأفراد هذا الشهر: 2,500/);
    const noRev = DashMod.segmentStrip({ ...DASH.segments, paid: { new_today: 0, open: 2, unconfirmed_wa: 0 } });
    assert.equal(noRev.querySelector('.pa-seg-rev'), null, 'case managers get no revenue line');
    assert.equal(DashMod.segmentStrip(null), null);
  });

  test('alert rows (r2 S9): «طلبات نوع خدمتها غير محدد: n» → #/inbox?segment=unset and «طلبات أفراد بلا واتساب مؤكد: n» → the paid call-back list, only when > 0; P1 monthly count', () => {
    const strip = DashMod.segmentStrip(DASH.segments);
    const unset = strip.querySelector('[data-alert="unset"]');
    assert.equal(text(unset.querySelector('.g-title')), 'طلبات نوع خدمتها غير محدد: 1');
    assert.equal(unset.getAttribute('href'), '#/inbox?segment=unset');
    const wa = strip.querySelector('[data-alert="unconfirmed_wa"]');
    assert.equal(text(wa.querySelector('.g-title')), 'طلبات أفراد بلا واتساب مؤكد: 2');
    assert.match(wa.getAttribute('href'), /^#\/inbox\?segment=paid(&|$)/);
    assert.equal(text(strip.querySelector('.g-foot')), 'حُوّلت من خيري إلى أفراد وشركات هذا الشهر: 1');
    const quiet = DashMod.segmentStrip({ charity: { new_today: 0, open: 0 }, paid: { new_today: 0, open: 0, unconfirmed_wa: 0 }, unset_open: 0, ineligible_overrides: 0 });
    assert.equal(quiet.querySelectorAll('[data-alert]').length, 0);
    assert.equal(quiet.querySelector('.g-foot'), null);
  });

  test('rendered dashboard (r2 S10): strip under the header, month «الخيري» + «الأفراد والشركات» from month.paid, «يشمل الخيري والأفراد» on the figures over both sides', async () => {
    stubFetch((c) => (c.url.startsWith('/api/admin/dashboard') ? { body: DASH } : { body: {} }));
    const page = await DashMod.default({ query: {}, params: {}, user: { id: 1, role: 'admin' } });
    const kids = page.children;
    assert.ok(kids[1].classList.contains('pa-seg-strip'), 'the strip follows the header');
    assert.deepEqual(page.querySelectorAll('.pa-month-split .pa-mini-h').map(text), ['الخيري', 'الأفراد والشركات']);
    const paidMonth = page.querySelector('.pa-month[data-seg="paid"]');
    assert.equal(paidMonth.children.length, 3, 'no «استشارات تطوعية» on the paid side');
    assert.match(text(paidMonth), /ملفات فُتحت\s*2/);
    const all = text(page);
    assert.ok((all.match(/يشمل الخيري والأفراد/g) || []).length >= 3, 'open cases, cases by status and weekly volume');
  });

  test('impact header line «تقرير الأثر يخص الخدمة الخيرية فقط.» on screen only (the printed report stays as in 10.0)', () => {
    const src = read(`${APP}pages/admin/impact.js`);
    assert.match(src, /meta: h\('p\.v9p-scope-line\.no-print', \{ dataset: \{ scope: 'charity' \} \}, 'تقرير الأثر يخص الخدمة الخيرية فقط\.'\)/);
  });

  test('analytics switch (r2 S10, P0): «الكل · خيري · أفراد وشركات», default all with «يشمل الخيري والأفراد»; a side refetches funnel + areas with segment= and drops the caption', async () => {
    withWindow('#/analytics');
    const calls = stubFetch((c) => {
      if (c.url.startsWith('/api/admin/analytics/funnel')) {
        const all = !/segment=(charity|paid)/.test(c.url);
        return { body: { items: [], totals: { intakes: 3, cases: 1, messages: 4 }, ...(all ? { scope_label: 'يشمل الخيري والأفراد' } : {}) } };
      }
      if (c.url.startsWith('/api/admin/analytics/areas')) return { body: { items: [], weekly: [] } };
      if (c.url.startsWith('/api/admin/analytics/spend')) return { body: { items: [], campaigns: [] } };
      return { body: {} };
    });
    const mod = await import('../public/assets/js/app/pages/admin/analytics.js');
    const fragEl = await mod.default({ query: {}, params: {}, user: { id: 1, role: 'admin' } });
    const page = globalThis.document.createElement('div');
    page.appendChild(fragEl);
    await settle();
    const sw = page.querySelector('.pd-seg-control .seg-switch');
    assert.deepEqual(sw.querySelectorAll('button.seg').map((b) => b.dataset.seg), ['all', 'charity', 'paid'], 'no «غير محدد» in reports');
    assert.deepEqual(sw.querySelectorAll('.seg-l-full, .seg-l').filter((x) => !x.classList.contains('seg-l-short')).map(text), ['الكل', 'خيري', 'أفراد وشركات']);
    assert.equal(sw.querySelector('[aria-pressed="true"]').dataset.seg, 'all');
    assert.equal(text(page.querySelector('.pd-scope-line')), 'يشمل الخيري والأفراد');
    assert.ok(calls.some((c) => c.url.startsWith('/api/admin/analytics/funnel') && !/segment=/.test(c.url)), 'default = 10.0 request');
    sw.querySelector('[data-seg="paid"]').click();
    await settle();
    assert.ok(calls.some((c) => c.url.startsWith('/api/admin/analytics/funnel') && /segment=paid/.test(c.url)));
    assert.ok(calls.some((c) => c.url.startsWith('/api/admin/analytics/areas') && /segment=paid/.test(c.url)));
    assert.equal(page.querySelector('.pd-scope-line').hidden, true);
    dropWindow();
    withWindow('#/dashboard');
  });

  test('accounting: «منها عمل الأفراد والشركات» under each lawyer\'s period amount and in the totals card, from paid_individuals', () => {
    const src = read(`${APP}pages/admin/accounting.js`);
    assert.match(src, /return v \? `منها عمل الأفراد والشركات: \$\{money\(v\)\}` : null;/);
    assert.match(src, /const share = paidShareText\(l\.paid_individuals\);/);
    assert.match(src, /paidShareText\(t\.paid_individuals\) \? `قيود الفترة غير الملغاة · \$\{paidShareText\(t\.paid_individuals\)\}`/);
  });
});

describe('v11 segment-staff — override sheet in its modal (§10.4: discard guard, 403/409 inline)', () => {
  before(() => withWindow('#/inbox/1'));
  after(() => dropWindow());

  test('openSegmentSheet: a 403 fees_recorded / 409 segment_on_case stays inside the sheet with the server text; a dirty sheet asks before closing; a save toasts the new side and calls onSaved', async () => {
    const SERVER = { 403: { error: 'سُجّلت أتعاب على هذا الملف؛ تغيير نوع الخدمة لمدير النظام فقط.', code: 'fees_recorded' }, 409: { error: 'غيّروا نوع الخدمة من صفحة الملف.', code: 'segment_on_case', details: { case_id: 9 } } };
    let status = 403;
    const calls = stubFetch((c) => (status === 200 ? { body: { value: c.body.segment, unchanged: false, affected_periods: ['2026-09'] } } : { status, body: SERVER[status] }));
    let saved = null;
    UI.openSegmentSheet({ kind: 'case', id: 7, current: 'paid', onSaved: (r) => (saved = r) });
    const sheet = () => globalThis.document.body.querySelectorAll('.seg-sheet').at(-1);
    const dlg = sheet();
    assert.ok(dlg, 'the sheet is open');
    assert.ok(text(dlg).includes('نوع الخدمة لهذا الملف'));
    const charity = dlg.querySelectorAll('input[type="radio"]').find((r) => r.value === 'charity');
    charity.click();
    const reason = dlg.querySelector('textarea');
    reason.value = 'أرملة ودخلها لا يكفي';
    reason.dispatch('input');
    const save = dlg.querySelectorAll('button').find((b) => text(b) === 'حفظ');
    save.click();
    await settle();
    assert.equal(calls.at(-1).url, '/api/admin/cases/7/segment');
    assert.deepEqual(calls.at(-1).body, { segment: 'charity', reason: 'أرملة ودخلها لا يكفي' });
    assert.equal(text(dlg.querySelector('.seg-sheet-alert')), SERVER[403].error);
    assert.ok(dlg.isConnected, '403 keeps the sheet open');
    status = 409;
    save.click();
    await settle();
    assert.equal(text(dlg.querySelector('.seg-sheet-alert')), SERVER[409].error);
    // discard guard: closing a dirty sheet asks first (the confirm dialog opens on top)
    const before2 = globalThis.document.body.querySelectorAll('.modal').length;
    dlg.querySelector('.modal-close').click();
    await settle();
    assert.ok(globalThis.document.body.querySelectorAll('.modal').length > before2, 'a discard confirm opened');
    assert.ok(dlg.isConnected, 'not closed without confirmation');
    // keep editing → save succeeds
    const keep = globalThis.document.body.querySelectorAll('.modal').at(-1).querySelectorAll('button').find((b) => /متابعة|إكمال|رجوع|ألغ/.test(text(b)) && !/تجاهل/.test(text(b))) || globalThis.document.body.querySelectorAll('.modal').at(-1).querySelectorAll('button')[0];
    keep.click();
    await settle(10);
    status = 200;
    save.click();
    await settle(10);
    assert.deepEqual(saved, { value: 'charity', unchanged: false, affected_periods: ['2026-09'] });
    assert.deepEqual(UI.afterChangeNotes(saved), ['الفترات المغلقة لم تتغير: 2026-09']);
  });
});

describe('v11 segment-staff — ST-6 settings, integrations, audit', () => {
  before(() => withWindow('#/settings'));
  after(() => dropWindow());

  test('kill switch card «شاشة الاختيار» (L11-27): exact toggle text, org_phone_paid «فارغ = نفس هاتف المؤسسة», saves both through PATCH /api/admin/settings', async () => {
    const calls = stubFetch((c) => ({ body: c.method === 'PATCH' ? { ...c.body } : {} }));
    const { gateSettingsCard, GATE_TOGGLE_TEXT } = await import('../public/assets/js/app/components/site-settings.js');
    assert.equal(GATE_TOGGLE_TEXT, 'إظهار شاشة الاختيار (خيري / خدمات الأفراد والشركات) لأول زيارة');
    const card = gateSettingsCard({ site_gate_enabled: true, org_phone_paid: '' });
    assert.equal(card.id, 'gate');
    const cb = card.querySelector('input[type="checkbox"]');
    assert.equal(cb.checked, true);
    assert.ok(text(card).includes(GATE_TOGGLE_TEXT));
    assert.ok(text(card).includes('هاتف خدمات الأفراد والشركات (اختياري)'));
    assert.ok(text(card).includes('فارغ = نفس هاتف المؤسسة'));
    cb.click();
    card.querySelector('form').dispatch('submit');
    await settle();
    const patch = calls.find((c) => c.method === 'PATCH');
    assert.equal(patch.url, '/api/admin/settings');
    assert.deepEqual(patch.body, { site_gate_enabled: false, org_phone_paid: '' });
    assert.match(read(`${APP}pages/admin/settings.js`), /gateSettingsCard\(settings\), \/\/ v11 segment-staff/);
  });

  test('WhatsApp mode change (r2 S3): 409 mode_change_confirm → a confirm dialog with the server text → resend with confirm:true; cancelling sends nothing more', async () => {
    const { saveIntegrationValues } = await import('../public/assets/js/app/pages/admin/integrations.js');
    const MSG = 'فيه 23 محادثة واتساب مفتوحة؛ تغيير الوضع يغيّر طريقة تصنيف رسائلهم الجديدة. أكّدوا للمتابعة.';
    const reply = (c) => (c.body && c.body.confirm === true ? { body: { ok: true } } : { status: 409, body: { error: MSG, code: 'mode_change_confirm', details: { open: 23 } } });
    let calls = stubFetch(reply);
    const asked = [];
    const res = await saveIntegrationValues('whatsapp', { segment: 'shared' }, { ask: async (m) => (asked.push(m), true) });
    assert.deepEqual(asked, [MSG]);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].body, { values: { segment: 'shared' }, confirm: true });
    assert.equal(calls[1].method, 'PUT');
    assert.deepEqual(res, { ok: true });
    calls = stubFetch(reply);
    await assert.rejects(() => saveIntegrationValues('whatsapp', { segment: 'shared' }, { ask: async () => false }), /لم يُحفظ شيء — بقي وضع الرقم الأساسي كما هو\./);
    assert.equal(calls.length, 1);
    assert.match(read(`${APP}pages/admin/integrations.js`), /return saveIntegrationValues\(item\.name, patch\);/);
  });

  test('paid number (r2 S4): «رقم الأفراد والشركات: تم التحقق» / «…: لم يُتحقق بعد — اضغطوا اختبار الاتصال»; wa_paid_on_main toggle saves at once', async () => {
    const { paidLineSection, PAID_ON_MAIN_TEXT, PAID_GUIDE_TEXT } = await import('../public/assets/js/app/pages/admin/integrations.js');
    const item = (verified) => ({ name: 'whatsapp', fields: [{ key: 'paid_phone_number_id', set: true, value: '2000000000002' }], paid_verified_at: verified ? '2026-10-09T10:00:00Z' : null });
    assert.equal(text(paidLineSection(item(true), {}).querySelector('.pf-paid-state')), 'رقم الأفراد والشركات: تم التحقق');
    assert.equal(text(paidLineSection(item(false), {}).querySelector('.pf-paid-state')), 'رقم الأفراد والشركات: لم يُتحقق بعد — اضغطوا اختبار الاتصال');
    assert.equal(paidLineSection({ name: 'whatsapp', fields: [] }, {}).querySelector('.pf-paid-state'), null, 'no paid number → no state line');
    assert.equal(PAID_ON_MAIN_TEXT, 'استخدام الرقم الأساسي للأفراد والشركات عند عدم وجود رقم مخصص');
    assert.equal(PAID_GUIDE_TEXT, 'أضيفوا الرقم الثاني من WhatsApp Manager في نفس حساب واتساب للأعمال، ثم الصقوا معرّفه هنا. الرد يخرج دائمًا من الرقم الذي كتب عليه العميل.');
    const calls = stubFetch(() => ({ body: {} }));
    const sec = paidLineSection(item(true), { wa_paid_on_main: true });
    const cb = sec.querySelector('.pf-paid-on-main input');
    assert.equal(cb.checked, true);
    cb.click();
    await settle();
    assert.deepEqual(calls.map((c) => [c.method, c.url, c.body]), [['PATCH', '/api/admin/settings', { wa_paid_on_main: false }]]);
  });

  test('story settings (P1): the choice-buttons toggle is disabled with «تعمل فقط حين يكون الرقم الأساسي «الخدمتين معًا (رقم واحد)» في التكاملات.» unless main mode is shared; returning days field', async () => {
    const mod = await import('../public/assets/js/app/components/story-settings.js');
    const run = async (mode) => {
      stubFetch((c) => (c.url.startsWith('/api/admin/integrations') ? { body: { items: [{ name: 'whatsapp', fields: [{ key: 'segment', value: mode }] }] } } : { body: {} }));
      const card = mod.storySettingsCard({ wa_segment_choice_enabled: false, segment_returning_days: 365 });
      await settle();
      const box = card.querySelectorAll('input[type="checkbox"]').find((i) => text(i.closest('label')) === mod.CHOICE_TOGGLE_TEXT);
      return { box, note: card.querySelector('.pa-choice-note'), card };
    };
    const a = await run('charity');
    assert.equal(a.box.disabled, true);
    assert.equal(a.note.hidden, false);
    assert.equal(text(a.note), mod.CHOICE_DISABLED_TEXT);
    assert.equal(mod.CHOICE_DISABLED_TEXT, 'تعمل فقط حين يكون الرقم الأساسي «الخدمتين معًا (رقم واحد)» في التكاملات.');
    const b = await run('shared');
    assert.equal(b.box.disabled, false);
    assert.equal(b.note.hidden, true);
    assert.ok(text(b.card).includes('تذكّر نوع الخدمة لمن راسلنا قبل كده (أيام، 0 = لا)'));
  });

  test('templates (r2 S15), automations (P1), lawyer rate (P1), audit groups: the @paid fallback never names the charity template; «نص الخيري» / «نص الأفراد والشركات»; «سعر العمل المدفوع (أفراد وشركات)»; group «segment»', () => {
    const qr = read(`${APP}pages/admin/quick-replies.js`);
    assert.match(qr, /\/@paid\$\/\.test\(m\.purpose\)/);
    assert.match(qr, /لا يصل قالب الخيري لطلب بأتعاب\./);
    const au = read(`${APP}pages/admin/automations.js`);
    assert.match(au, /export const TPL_CHARITY = 'نص الخيري';/);
    assert.match(au, /export const TPL_PAID = 'نص الأفراد والشركات';/);
    assert.match(au, /if \(hasPaid\) fields\.push\(\{ name: 'template_paid', label: TPL_PAID,/);
    assert.match(au, /for \(const key of hasPaid \? \['template', 'template_paid'\] : \['template'\]\)/);
    assert.match(read(`${APP}pages/admin/lawyer-detail.js`), /export const PAID_RATE_LABEL = 'سعر العمل المدفوع \(أفراد وشركات\)';/);
    const audit = read(`${APP}pages/admin/audit.js`);
    const block = /const GROUP_LABELS = \{([\s\S]*?)\};/.exec(audit)[1];
    assert.match(block, /segment: 'نوع الخدمة \(خيري \/ أفراد وشركات\)'/);
    assert.match(block, /integration: 'التكاملات'/, 'integration.wa_mode_changed is grouped with the integrations');
    assert.match(audit, /type === 'integration\.wa_mode_changed'\) return label\('wa_segment_mode', v\)/);
  });
});

describe('v11 segment-staff — ST-7 simulator', () => {
  test('«الرقم»: الأساسي · الأفراد والشركات · مشترك (تجربة) · رقم غير مضبوط (تجربة); reply kind «زر اختيار نوع الخدمة» (seg:charity / seg:paid); every send carries `line`; the result shows the chip', async () => {
    withWindow('#/simulator');
    const mod = await import('../public/assets/js/app/pages/admin/simulator.js');
    assert.deepEqual(mod.SIM_LINES.map((l) => [l.key, l.label]), [
      ['main', 'الأساسي'],
      ['paid', 'الأفراد والشركات'],
      ['shared', 'مشترك (تجربة)'],
      ['unknown', 'رقم غير مضبوط (تجربة)'],
    ]);
    assert.equal(mod.SEG_REPLY_KIND, 'زر اختيار نوع الخدمة');
    assert.deepEqual(mod.SEG_REPLIES.map((r) => r.id), ['seg:charity', 'seg:paid']);
    const page = await mod.default({ query: {}, params: {}, user: { id: 1, role: 'admin' } });
    const sw = page.querySelector('.pa-sim-line');
    assert.deepEqual(sw.querySelectorAll('button.seg').map(text), mod.SIM_LINES.map((l) => l.label));
    assert.equal(sw.querySelector('[aria-pressed="true"]').dataset.line, 'main');
    const src = read(`${APP}pages/admin/simulator.js`);
    assert.match(src, /const body = \{ from: v\.from, name: v\.name \|\| undefined, text: v\.text, line: simLine \};/);
    assert.match(src, /const body = \{ from: v\.from, name: v\.name \|\| undefined, kind, line: simLine, \.\.\.extra \};/);
    assert.match(src, /sendQuick\('seg_reply', \{ reply_id: b\.id \}, b\.title\)/);
    assert.match(src, /segmentChip\(res\.segment \?\? null, \{ source: res\.segment_source \|\| undefined, size: 'label' \}\)/);
    dropWindow();
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

// ───────────────────────── build-2: تكامل HTTP لما تقوده صفحات ST-5…ST-7 (نسخة مستقلة لأنها تغيّر الإعدادات) ─────────────────────────
describe('v11 segment-staff — dashboard, settings, integrations and simulator endpoints (demo seed)', () => {
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

  test('dashboard strip == inbox switch: open per side and «غير محدد» match segment_counts; the paid call-back alert is non-zero on demo data; revenue for admins only', async () => {
    const d = (await admin.get('/api/admin/dashboard')).body;
    const inbox = (await admin.get('/api/admin/intakes?scope=open&limit=1')).body.segment_counts;
    assert.equal(d.segments.charity.open, inbox.charity);
    assert.equal(d.segments.paid.open, inbox.paid);
    assert.equal(d.segments.unset_open, inbox.unset);
    assert.ok(d.segments.unset_open >= 1, 'demo 01092000305');
    assert.ok(d.segments.paid.unconfirmed_wa >= 1, 'demo 01092000302 (paid website, unconfirmed)');
    assert.equal(d.cases_scope_label, 'يشمل الخيري والأفراد');
    assert.ok(d.month.paid && 'cases_opened' in d.month.paid && 'lawyer_cost' in d.month.paid);
    assert.ok('revenue_month' in d.segments.paid);
    const m = (await manager.get('/api/admin/dashboard')).body;
    assert.ok(!('revenue_month' in m.segments.paid), 'case manager: no revenue');
  });

  test('analytics: segment=all (default) carries the caption; charity/paid do not and split the totals', async () => {
    const all = (await admin.get('/api/admin/analytics/funnel')).body;
    assert.equal(all.scope_label, 'يشمل الخيري والأفراد');
    const ch = (await admin.get('/api/admin/analytics/funnel?segment=charity')).body;
    const pd = (await admin.get('/api/admin/analytics/funnel?segment=paid')).body;
    assert.equal(ch.scope_label, undefined);
    assert.equal(pd.scope_label, undefined);
    assert.ok(ch.totals.intakes + pd.totals.intakes <= all.totals.intakes);
    const areas = (await admin.get('/api/admin/analytics/areas?segment=paid')).body;
    assert.equal(areas.segment, 'paid');
    const acc = (await admin.get('/api/admin/accounting/summary')).body;
    assert.deepEqual(Object.keys(acc.totals.paid_individuals).sort(), ['events', 'period_amount', 'unpaid']);
    for (const l of acc.lawyers) assert.ok(l.paid_individuals, l.name);
  });

  test('kill switch round-trip (PW-S5 in HTTP): site_gate_enabled false → `/` without a cookie has no #gate; true → the gate; org_phone_paid saves and is validated', async () => {
    const anon = t.client();
    assert.match((await anon.get('/')).body, /id="gate"/);
    const off = await admin.patch('/api/admin/settings', { site_gate_enabled: false });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    assert.equal(off.body.site_gate_enabled, false);
    assert.doesNotMatch((await anon.get('/')).body, /id="gate"/);
    assert.doesNotMatch((await anon.get('/', { cookie: 'bm_seg=paid' })).body, /id="gate"/);
    const on = await admin.patch('/api/admin/settings', { site_gate_enabled: true, org_phone_paid: '01211114663' });
    assert.equal(on.status, 200);
    assert.equal(on.body.org_phone_paid, '01211114663');
    assert.match((await anon.get('/')).body, /id="gate"/);
    const bad = await admin.patch('/api/admin/settings', { org_phone_paid: 'اتصل بنا' });
    assert.equal(bad.status, 400);
    assert.equal((await manager.patch('/api/admin/settings', { site_gate_enabled: false })).status, 403, 'admin only');
    await admin.patch('/api/admin/settings', { org_phone_paid: '' });
  });

  test('integrations mode change (r2 S3): 409 mode_change_confirm with the Arabic count, then confirm:true saves and audits integration.wa_mode_changed', async () => {
    // the demo paid number must go first (a paid number needs main = charity)
    const clear = await admin.put('/api/admin/integrations/whatsapp', { values: { paid_phone_number_id: '', paid_number: '' } });
    assert.equal(clear.status, 200, JSON.stringify(clear.body));
    const r1 = await admin.put('/api/admin/integrations/whatsapp', { values: { segment: 'shared' } });
    assert.equal(r1.status, 409, JSON.stringify(r1.body));
    assert.equal(r1.body.code, 'mode_change_confirm');
    assert.match(r1.body.error, /^فيه .+ مفتوح.*أكّدوا للمتابعة\.$/);
    const r2 = await admin.put('/api/admin/integrations/whatsapp', { values: { segment: 'shared' }, confirm: true });
    assert.equal(r2.status, 200, JSON.stringify(r2.body));
    const items = (await admin.get('/api/admin/integrations')).body.items;
    assert.equal(items.find((x) => x.name === 'whatsapp').fields.find((f) => f.key === 'segment').value, 'shared');
    const audit = (await admin.get('/api/admin/audit?type=integration.wa_mode_changed')).body.items;
    assert.ok(audit.length >= 1);
    const back = await admin.put('/api/admin/integrations/whatsapp', { values: { segment: 'charity' }, confirm: true });
    assert.equal(back.status, 200);
  });

  test('simulator (PW-S6 in HTTP): shared line → «غير محدد» + the two choice buttons; «أفراد وشركات» → paid (wa_choice); paid line → paid; unknown line → stored, no automated reply', async () => {
    const from = '01093333001';
    const s1 = await manager.post('/api/admin/simulate/whatsapp', { from, text: 'السلام عليكم عندي مشكلة في شقة الإيجار', line: 'shared' });
    assert.equal(s1.status, 200, JSON.stringify(s1.body));
    assert.equal(s1.body.segment, null);
    const btns = s1.body.replies.flatMap((r) => (r.wa && r.wa.type === 'buttons' ? r.wa.buttons : []));
    assert.deepEqual(btns.map((b) => b.id), ['seg:charity', 'seg:paid']);
    const s2 = await manager.post('/api/admin/simulate/whatsapp', { from, kind: 'seg_reply', reply_id: 'seg:paid', line: 'shared' });
    assert.equal(s2.body.segment, 'paid');
    assert.equal(s2.body.segment_source, 'wa_choice');
    const s3 = await manager.post('/api/admin/simulate/whatsapp', { from: '01093333002', text: 'محتاج استشارة في عقد عمل', line: 'paid' });
    assert.equal(s3.body.segment, 'paid');
    assert.equal(s3.body.wa_line, 'paid');
    const s4 = await manager.post('/api/admin/simulate/whatsapp', { from: '01093333003', text: 'رسالة على رقم غير مضبوط', line: 'unknown' });
    assert.equal(s4.body.wa_line, 'unknown');
    assert.deepEqual(s4.body.replies, []);
    const det = (await manager.get(`/api/admin/intakes/${s4.body.intake_id}`)).body;
    assert.equal(det.segment.wa_line, 'unknown');
    assert.ok(det.segment.wa_pid_last4, 'the request page shows «وصلت على رقم غير مضبوط (…last4)»');
  });

  test('@paid template purposes list and save through the existing mapping endpoint (r2 S15)', async () => {
    const data = (await admin.get('/api/admin/whatsapp/templates')).body;
    const paid = data.mappings.filter((m) => /@paid$/.test(m.purpose)).map((m) => m.purpose);
    assert.deepEqual(paid.sort(), ['case_update@paid', 'portal_update@paid', 'rule:document_reminder@paid', 'rule:hearing_reminder@paid', 'rule:invoice_reminder@paid', 'survey@paid'].sort());
    const put = await admin.put(`/api/admin/whatsapp/template-mappings/${encodeURIComponent('case_update@paid')}`, { template_name: 'case_update', language: 'ar', params: ['body'] });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    const after2 = (await admin.get('/api/admin/whatsapp/templates')).body.mappings.find((m) => m.purpose === 'case_update@paid');
    assert.equal(after2.state, 'ok');
    assert.equal(after2.mapping.template_name, 'case_update');
  });
});

// ───────────────────────── review (segment-staff): اختبار لكل خلل وُجد في المراجعة ─────────────────────────
describe('v11 segment-staff — review regressions', () => {
  const ONE = { id: 9, code: 'REQ-9', status: 'new', contact_name: 'أم علي', first_channel: 'website', channels: ['website'], source: 'direct', segment: 'charity', segment_source: 'website', story: { view: 'ready' }, created_at: '2026-10-09T06:00:00Z' };
  const inboxReply = (c) => {
    if (!c.url.startsWith('/api/admin/intakes')) return { body: {} };
    if (/segment=unset/.test(c.url)) return { body: { total: 0, counts: { new: 1 }, story_counts: {}, segment_counts: { charity: 1, paid: 0, unset: 0 }, items: [] } };
    return { body: { total: 1, counts: { new: 1, converted: 5 }, story_counts: { ready: 1 }, segment_counts: { charity: 1, paid: 0, unset: 0 }, items: [ONE] } };
  };

  test('inbox: a remembered «غير محدد» that hides everything is named in the empty state and cleared in one tap (was «لا توجد طلبات مفتوحة تنتظر الفرز الآن»)', async () => {
    withWindow('#/inbox');
    window.localStorage.setItem('bm.inbox.seg', 'unset');
    const calls = stubFetch(inboxReply);
    const mod = await import('../public/assets/js/app/pages/admin/inbox.js');
    const page = await mod.default({ query: {}, params: {}, user: { id: 1, role: 'admin' }, navigate() {}, reload() {} });
    assert.match(calls[0].url, /segment=unset/);
    const empty = text(page.querySelector('.pa-stories, .empty-state, .card'));
    assert.match(empty, /لا توجد هنا طلبات نوع خدمتها «غير محدد»\./);
    const all = page.querySelector('.pa-seg-all');
    assert.ok(all, '«عرض كل الأنواع»');
    assert.equal(text(all), 'عرض كل الأنواع');
    all.click();
    await settle();
    assert.doesNotMatch(calls.at(-1).url, /segment=/);
    assert.equal(window.localStorage.getItem('bm.inbox.seg'), null);
    assert.equal(page.querySelector('.pa-segbar .seg-switch [aria-pressed="true"]').dataset.seg, 'all');
    assert.equal(page.querySelectorAll('article.pa-story').length, 1);
    dropWindow();
  });

  test('inbox: the switch counts (open requests) show on «المفتوحة» only — on a closed tab they would not match the list', async () => {
    withWindow('#/inbox');
    stubFetch(inboxReply);
    const mod = await import('../public/assets/js/app/pages/admin/inbox.js');
    const open = await mod.default({ query: {}, params: {}, user: { id: 1, role: 'admin' }, navigate() {}, reload() {} });
    assert.deepEqual(open.querySelector('.pa-segbar .seg-switch').querySelectorAll('.seg-n').map(text), ['1', '1', '0']);
    const closed = await mod.default({ query: { status: 'converted' }, params: {}, user: { id: 1, role: 'admin' }, navigate() {}, reload() {} });
    assert.deepEqual(closed.querySelector('.pa-segbar .seg-switch').querySelectorAll('.seg-n').map(text), []);
    dropWindow();
  });

  test('segmentSwitch.update({counts:null}) hides the numbers and update({counts}) brings them back (the first render may have none)', () => {
    const sw = UI.segmentSwitch({ value: '', counts: null });
    assert.equal(sw.querySelectorAll('.seg-n').length, 0);
    sw.update({ counts: { charity: 3, paid: 2, unset: 0 } });
    assert.deepEqual(sw.querySelectorAll('.seg-n').map(text), ['5', '3', '2']);
    sw.update({ counts: null });
    assert.equal(sw.querySelectorAll('.seg-n').length, 0);
  });

  test('afterChangeNotes: number–noun agreement for cancelled fee invoices (3 → «فواتير»، 11 → «فاتورة»)', () => {
    const n = (k) => UI.afterChangeNotes({ cancelled_invoices: Array.from({ length: k }, (_, i) => i + 1) })[0];
    assert.equal(n(1), 'أُلغيت فاتورة أتعاب واحدة لم تُدفع.');
    assert.equal(n(2), 'أُلغيت فاتورتا أتعاب لم تُدفعا.');
    assert.equal(n(3), 'أُلغيت 3 فواتير أتعاب لم تُدفع.');
    assert.equal(n(11), 'أُلغيت 11 فاتورة أتعاب لم تُدفع.');
  });

  test('request page: «تحويل إلى ملف» on a «غير محدد» request asks for the service type (required, no default, the hint) and sends it — no dead-end 409 inside the dialog', () => {
    const src = read(`${APP}pages/admin/intake-detail.js`);
    const conv = src.slice(src.indexOf('function openConvert'), src.indexOf('// ───────────── المحادثة'));
    assert.match(conv, /const segPick = segValue\s*\? null\s*: segmentChoice\(\{\s*required: true,\s*hint: seg\.hint \|\| null,/);
    assert.match(conv, /segPick && h\('div\.pa-convert-seg', segPick\)/);
    assert.match(conv, /if \(!okSeg\) segPick\.setError\(REQUIRED_TEXT\);/);
    assert.match(conv, /segment: segChosen \|\| undefined,/);
    assert.match(conv, /program_id: \(!isPaid && segChosen !== 'paid' && program\.get\(\)\) \|\| undefined,/);
    assert.match(conv, /err\.code === 'segment_required'\) segPick\.setError\(REQUIRED_TEXT\)/);
  });

  test('request page (r2 P12 «everywhere»): AI-suggestion, track and area pills are neutral — gold/green stay for the service type', () => {
    const src = read(`${APP}pages/admin/intake-detail.js`);
    assert.doesNotMatch(src, /TRACK_TONES/);
    assert.doesNotMatch(src, /badge\('اقتراح الذكاء الاصطناعي', 'accent'/);
    assert.doesNotMatch(src, /badge\(areaLabel\([^)]*\), 'primary'\)/);
    assert.doesNotMatch(src, /ai\.provider === 'anthropic' \? 'accent'/);
    assert.match(read('public/assets/css/v11-segment.css'), /:is\(\.pa-story, \.pa-irow, #pa-proposal\) \.pa-ai-tag \{ background: var\(--fill-1\); color: var\(--label-2\); \}/);
  });

  test('cases: a v10 link ?line=b2c leaves no hidden filter under «الكل»; ?line=b2b still opens «شركات»', async () => {
    withWindow('#/cases');
    const calls = stubFetch((c) => (c.url.startsWith('/api/admin/cases') ? { body: { items: [], total: 0, counts: {} } } : { body: [] }));
    const mod = await import('../public/assets/js/app/pages/admin/cases.js');
    const host = globalThis.document.createElement('div');
    host.appendChild(await mod.default({ query: { line: 'b2c' }, params: {}, user: { id: 1, role: 'admin' }, navigate() {} }));
    await settle();
    const list = calls.filter((c) => c.url.startsWith('/api/admin/cases'));
    assert.ok(list.length && list.every((c) => !/line=/.test(c.url)), list.map((c) => c.url).join(' '));
    assert.equal(host.querySelector('.seg-switch--cases [aria-pressed="true"]').dataset.seg, 'all');
    host.appendChild(await mod.default({ query: { line: 'b2b' }, params: {}, user: { id: 1, role: 'admin' }, navigate() {} }));
    await settle();
    assert.match(calls.filter((c) => c.url.startsWith('/api/admin/cases')).at(-1).url, /line=b2b/);
    dropWindow();
  });

  test('matters: under «الكل» a company matter carries «شركة», not «أفراد» (the list items have no company_id)', async () => {
    withWindow('#/matters');
    const rows = [
      { id: 1, code: 'MTR-1', title: 'نزاع توريد', status: 'open', kind: 'litigation', segment: 'paid', client_name: 'شركة النيل', client_code: 'CL-1', open_tasks: 0, overdue_tasks: 0, unpaid_invoices: 0 },
      { id: 2, code: 'MTR-2', title: 'نفقة', status: 'open', kind: 'litigation', segment: 'paid', client_name: 'أم سارة', client_code: 'CL-2', open_tasks: 0, overdue_tasks: 0, unpaid_invoices: 0 },
    ];
    stubFetch((c) => (c.url.startsWith('/api/admin/matters') ? { body: { items: /line=b2b/.test(c.url) ? [rows[0]] : rows } } : { body: {} }));
    const mod = await import('../public/assets/js/app/pages/admin/matters.js');
    const host = globalThis.document.createElement('div');
    host.appendChild(await mod.default({ query: {}, params: {}, user: { id: 1, role: 'admin' }, navigate() {} }));
    await settle();
    const chips = host.querySelectorAll('.seg-chip').map(text);
    assert.ok(chips.includes('شركة') && chips.includes('أفراد'), chips.join(' | '));
    dropWindow();
  });

  test('override sheet: reason chips are soft buttons that show the picked reason (no UA button border); typing clears the pick', () => {
    const b = UI.segmentSheetBody({ kind: 'intake', current: 'charity' });
    const chips = b.controls.reasonChips.querySelectorAll('.seg-reason-chip');
    assert.deepEqual(chips.map((c) => c.getAttribute('aria-pressed')), ['false', 'false', 'false']);
    chips[1].click();
    assert.deepEqual(chips.map((c) => c.getAttribute('aria-pressed')), ['false', 'true', 'false']);
    b.controls.reason.value = 'سبب آخر مكتوب';
    b.controls.reason.dispatch('input');
    assert.deepEqual(chips.map((c) => c.getAttribute('aria-pressed')), ['false', 'false', 'false']);
    assert.match(read('public/assets/css/v11-segment.css'), /\.seg-reason-chip \{ min-height: 44px; padding-inline: 14px; border: 0;/);
  });

  test('case page: with recorded fees a case manager sees why the type is locked (server copy) instead of a «تغيير» that ends in 403; admins keep the button', () => {
    const src = read(`${APP}pages/admin/case-detail.js`);
    assert.match(src, /const adminOnlyForMe = Boolean\(seg\.admin_only\) && !\(ctx\.user && ctx\.user\.role === 'admin'\);/);
    assert.match(src, /h\('span\.seg-src\.seg-admin-only', 'سُجّلت أتعاب على هذا الملف؛ تغيير نوع الخدمة لمدير النظام فقط\.'\)/);
  });

  test('case fees: the agreement state uses status tones (blue agreed, orange waiting), never the green of «أفراد»; rows align amounts in one column', () => {
    const src = read(`${APP}pages/admin/case-detail.js`);
    assert.match(src, /badge\('تمت الموافقة', 'info'/);
    assert.match(src, /badge\('بانتظار الموافقة', 'warning'/);
    const css = read('public/assets/css/v11-segment.css');
    assert.match(css, /\.seg-fees-list \{ display: grid; grid-template-columns: minmax\(0, 1fr\) auto auto;/);
    assert.match(css, /\.seg-fee-row \{ display: grid; grid-column: 1 \/ -1; grid-template-columns: subgrid;/);
    assert.match(src, /h\('span\.seg-amount', x\.amount != null \?/);
  });
});

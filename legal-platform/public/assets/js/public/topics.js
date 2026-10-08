// v9.2 — مصدر واحد لمواضيع الطلب (الموقع وقائمة واتساب والإدارة والذكاء الاصطناعي).
// وحدة نقية: بلا استيراد وبلا DOM؛ يستوردها المتصفح (intake.js) والخادم (site.js، routes/public.js، stories.js، intakes.js، ai).
// الترتيب والكلمات ثابتة: نفس الصورة ونفس الكلمة = نفس المعنى في كل مكان (S-02).
// say: يُقال بصوت عالٍ في أول شاشة وشاشة اختيار الموضوع، فهو بصيغة الجمع المحايدة (S-25).
// example / placeholder / wa_desc: داخل النموذج بعد أول ضغطة، فهي بالمؤنث.

export const TOPICS = [
  {
    key: 'inh',
    label: 'ورث',
    staff: 'ورث',
    area: 'INH',
    picto: 'inh',
    service_key: 'inheritance',
    wa_title: 'ورث',
    wa_desc: 'ورث جوزك أو أهلك، إعلام الوراثة، تقسيم بيت أو أرض',
    example: 'جوزي اتوفى، وعايزة أعرف نصيبي ونصيب العيال',
    placeholder: 'مثلًا: جوزي اتوفى، وعايزة أعرف نصيبي ونصيب العيال',
    wa_phrase: 'في الورث',
    say: 'ورث: لو حد اتوفى وعايزين تعرفوا نصيبكم.',
    seo: 'المواريث وإعلام الوراثة',
    questions: ['inh.deceased', 'inh.certificate'],
  },
  {
    key: 'pen',
    label: 'معاش',
    staff: 'معاش',
    area: 'PEN',
    picto: 'pen',
    service_key: 'pensions',
    wa_title: 'معاش',
    wa_desc: 'معاش جوزك أو أبوكي، تكافل وكرامة، وقف أو رفض الصرف',
    example: 'عايزة أطلّع معاش جوزي أو تكافل وكرامة',
    placeholder: 'مثلًا: عايزة أطلّع معاش جوزي أو تكافل وكرامة',
    wa_phrase: 'في المعاش',
    say: 'معاش: معاش حد اتوفى، أو تكافل وكرامة.',
    seo: 'المعاشات و«تكافل وكرامة»',
    questions: ['pen.whose', 'pen.status'],
  },
  {
    key: 'guardianship',
    label: 'فلوس الأيتام',
    staff: 'فلوس الأيتام',
    area: 'GRD',
    picto: 'guardianship',
    service_key: 'guardianship',
    wa_title: 'فلوس الأيتام',
    wa_desc: 'فلوس العيال في البنك أو البوستة، النيابة الحسبية، الوصي',
    example: 'محتاجة أصرف فلوس العيال اللي في البنك أو البريد',
    placeholder: 'مثلًا: محتاجة أصرف فلوس العيال اللي في البنك أو البريد',
    wa_phrase: 'في فلوس الأيتام',
    say: 'فلوس الأيتام: فلوس العيال اللي في البنك أو البوستة.',
    seo: 'الولاية على المال والنيابة الحسبية',
    questions: ['guardianship.where', 'children'],
  },
  {
    key: 'alimony',
    label: 'نفقة',
    staff: 'نفقة',
    area: 'FAM',
    picto: 'alimony',
    service_key: 'alimony',
    wa_title: 'نفقة',
    wa_desc: 'مصاريف العيال الشهرية من أبوهم، نفقة متأخرة',
    example: 'أبو العيال مش بيصرف عليهم',
    placeholder: 'مثلًا: أبو العيال مش بيصرف عليهم',
    wa_phrase: 'في النفقة',
    say: 'نفقة: لو أبو العيال مش بيصرف عليهم.',
    seo: 'النفقة',
    questions: ['alimony.father', 'children'],
  },
  {
    key: 'custody',
    label: 'حضانة ورؤية',
    staff: 'حضانة ورؤية',
    area: 'FAM',
    picto: 'custody',
    service_key: 'custody',
    wa_title: 'حضانة ورؤية',
    wa_desc: 'العيال يقعدوا مع مين، مواعيد الرؤية',
    example: 'عايزين ياخدوا مني العيال',
    placeholder: 'مثلًا: عايزين ياخدوا مني العيال',
    wa_phrase: 'في الحضانة والرؤية',
    say: 'حضانة ورؤية: العيال يقعدوا مع مين، أو مشكلة في الرؤية.',
    seo: 'الحضانة والرؤية',
    questions: ['custody.issue', 'children'],
  },
  {
    key: 'rent',
    label: 'سكن وإيجار',
    staff: 'سكن وإيجار',
    area: 'PRP',
    picto: 'rent',
    service_key: 'housing',
    wa_title: 'سكن وإيجار',
    wa_desc: 'إيجار قديم أو جديد، حد عايز يطلّعكم من الشقة',
    example: 'عايزين يطلّعوني من الشقة',
    placeholder: 'مثلًا: عايزين يطلّعوني من الشقة',
    wa_phrase: 'في السكن أو الإيجار',
    say: 'سكن وإيجار: لو حد عايز يطلّعكم من الشقة، أو مشكلة في الإيجار.',
    seo: 'السكن والإيجار',
    questions: ['rent.home', 'rent.evict'],
  },
  {
    key: 'papers',
    label: 'ورق رسمي',
    staff: 'ورق رسمي',
    area: 'ADM',
    picto: 'papers',
    service_key: 'documents',
    wa_title: 'ورق رسمي',
    wa_desc: 'شهادة وفاة أو ميلاد، بطاقة، قيد عائلي، تصحيح اسم',
    example: 'مش عارفة أطلّع شهادة الوفاة أو القيد العائلي',
    placeholder: 'مثلًا: مش عارفة أطلّع شهادة الوفاة أو القيد العائلي',
    wa_phrase: 'في ورق رسمي',
    say: 'ورق رسمي: زي شهادة الوفاة أو القيد العائلي.',
    seo: 'استخراج المستندات الرسمية',
    questions: ['papers.doc'],
  },
  {
    key: 'other',
    label: 'حاجة تانية',
    sub: 'أو مش عارفين',
    staff: 'أخرى',
    area: null,
    picto: 'other',
    service_key: 'other',
    wa_title: 'حاجة تانية',
    wa_desc: 'أي مشكلة تانية، أو مش عارف{ة} تختار{ي}',
    example: 'احكيلنا برضه، وإحنا نوجّهك',
    placeholder: 'مثلًا: جوزي اتوفى من 8 شهور، وعايزة أطلّع معاشه ونصيبنا في الشقة.',
    wa_phrase: null,
    say: 'حاجة تانية، أو مش عارفين تختاروا: احكولنا.',
    seo: null,
    questions: [],
  },
];

const a = (value, label, picto, staff) => ({ value, label, picto, staff });

// الأسئلة: إجابة بضغطة على صورة. كل سؤال يقبل كمان «مش عارفة» (UNKNOWN) في مربع مستقل بعرض الشاشة.
export const QUESTIONS = {
  'inh.deceased': {
    id: 'inh.deceased',
    staff_title: 'المتوفى',
    h1: 'مين اللي اتوفى؟',
    sub: '',
    answers: [
      a('husband', 'جوزي', 'husband', 'الزوج'),
      a('parent', 'أبويا أو أمي', 'parents', 'أحد الوالدين'),
      a('child', 'ابني أو بنتي', 'child_gone', 'الابن أو الابنة'),
      a('other', 'حد تاني', 'someone', 'شخص آخر'),
    ],
  },
  'inh.certificate': {
    id: 'inh.certificate',
    staff_title: 'إعلام الوراثة',
    h1: 'طلّعتوا إعلام الوراثة؟',
    sub: '(ورقة من المحكمة بتقول مين الورثة)',
    answers: [a('yes', 'أيوه، طلّعناه', 'check', 'مُستخرج'), a('no', 'لسه', 'cross', 'لم يُستخرج بعد')],
  },
  'pen.whose': {
    id: 'pen.whose',
    staff_title: 'المعاش عن',
    h1: 'معاش مين؟',
    sub: '',
    answers: [
      a('husband', 'معاش جوزي', 'husband', 'الزوج'),
      a('parent', 'معاش أبويا أو أمي', 'parents', 'أحد الوالدين'),
      a('takaful', 'تكافل وكرامة', 'takaful', 'تكافل وكرامة'),
      a('other', 'حاجة تانية', 'someone', 'أخرى'),
    ],
  },
  'pen.status': {
    id: 'pen.status',
    staff_title: 'حالة الصرف',
    h1: 'المعاش بيتصرف دلوقتي؟',
    sub: '',
    answers: [
      a('never', 'لسه ما اتصرفش', 'hourglass', 'لم يُصرف بعد'),
      a('stopped', 'كان بيتصرف ووقف', 'stopped', 'توقف الصرف'),
      a('less', 'بيتصرف بس قليل', 'less', 'يُصرف بقيمة أقل'),
    ],
  },
  'guardianship.where': {
    id: 'guardianship.where',
    staff_title: 'مكان أموال الأطفال',
    h1: 'فلوس العيال فين؟',
    sub: '',
    answers: [
      a('bank', 'في البنك', 'bank', 'بنك'),
      a('post', 'في البوستة', 'post', 'البريد'),
      a('estate', 'ورث لسه ما اتقسمش', 'inh', 'تركة لم تُقسم'),
      a('other', 'حاجة تانية', 'someone', 'أخرى'),
    ],
  },
  'alimony.father': {
    id: 'alimony.father',
    staff_title: 'والد الأطفال',
    h1: 'أبو العيال فين؟',
    sub: '',
    answers: [
      a('deceased', 'اتوفى', 'father_gone', 'متوفى'),
      a('divorced', 'متطلقين', 'split_couple', 'مطلقان'),
      a('absent', 'سايبنا ومش بيصرف', 'father_away', 'هجر ولا ينفق'),
      a('other', 'حاجة تانية', 'someone', 'أخرى'),
    ],
  },
  'custody.issue': {
    id: 'custody.issue',
    staff_title: 'المشكلة',
    h1: 'المشكلة في إيه؟',
    sub: '',
    answers: [
      a('take', 'عايزين ياخدوا العيال مني', 'take_child', 'نزاع على الحضانة'),
      a('nosee', 'مش بشوف عيالي', 'no_see', 'لا ترى أطفالها'),
      a('visit', 'مشكلة في الرؤية', 'visit', 'مشكلة في مواعيد الرؤية'),
      a('other', 'حاجة تانية', 'someone', 'أخرى'),
    ],
  },
  children: {
    id: 'children',
    staff_title: 'عدد الأطفال تحت 18 (حسب كلامها)',
    h1: 'عندك كام عيل تحت 18 سنة؟',
    sub: '',
    answers: [a('1', '1', 'kids_1', '1'), a('2', '2', 'kids_2', '2'), a('3', '3', 'kids_3', '3'), a('4', '4 أو أكتر', 'kids_4', '4 أو أكثر')],
  },
  'rent.home': {
    id: 'rent.home',
    staff_title: 'السكن',
    h1: 'الشقة اللي ساكنة فيها إيجار ولا ملك؟',
    sub: '',
    answers: [
      a('rented_old', 'إيجار قديم', 'old_rent', 'إيجار قديم'),
      a('rented_new', 'إيجار جديد', 'new_rent', 'إيجار جديد'),
      a('owned', 'ملك', 'owned', 'مملوك'),
      a('family', 'عند العيلة', 'family_home', 'إقامة لدى الأسرة'),
    ],
  },
  'rent.evict': {
    id: 'rent.evict',
    staff_title: 'تهديد بالطرد',
    h1: 'فيه حد عايز يطلّعك من الشقة؟',
    sub: '',
    answers: [a('yes', 'أيوه', 'door_out', 'نعم'), a('no', 'لأ', 'home_in', 'لا')],
  },
  'papers.doc': {
    id: 'papers.doc',
    staff_title: 'المستند المطلوب',
    h1: 'محتاجة ورقة إيه؟',
    sub: '',
    answers: [
      a('death', 'شهادة وفاة', 'doc_death', 'شهادة وفاة'),
      a('family', 'قيد عائلي', 'doc_family', 'قيد عائلي'),
      a('id', 'بطاقة أو شهادة ميلاد', 'doc_id', 'بطاقة أو شهادة ميلاد'),
      a('other', 'ورقة تانية', 'doc_other', 'مستند آخر'),
    ],
  },
};

/** «مش عارفة»: إجابة مقبولة لكل سؤال، في مربع مستقل بعرض الشاشة */
export const UNKNOWN = { value: 'unknown', label: 'مش عارفة', picto: 'dontknow', staff: 'لا تعرف' };

/** عنوان سطور الاختيارات حيثما تُعرض للإدارة أو تُرسل للذكاء الاصطناعي: ضغطات على صور، قد تكون عشوائية، وكلامها هي الأهم */
export const STAFF_LINES_TITLE = 'اختيارات ضغطت عليها في الموقع (قد تكون غير دقيقة)';

/** مفاتيح قديمة (روابط «بنساعد في إيه؟» في 9.1) */
export const ALIASES = { inheritance: 'inh', pensions: 'pen', housing: 'rent', documents: 'papers' };

/** وقت المكالمة: label للمستفيدة، staff للإدارة */
export const CALLBACK_WHEN = {
  morning: { label: 'الصبح', staff: 'صباحًا' },
  noon: { label: 'الضهر', staff: 'ظهرًا' },
  any: { label: 'أي وقت', staff: 'أي وقت' },
};

/** بداية كل رسالة واتساب جاهزة لموضوع («السلام عليكم، عندي مشكلة في الورث.») */
export const WA_PREFILL = 'السلام عليكم، عندي مشكلة ';

const BY_KEY = new Map(TOPICS.map((t) => [t.key, t]));
const MAX_ANSWERS = 6;

/** مفتاح أو اسم قديم ← الموضوع، وإلا null */
export function topicByKey(k) {
  if (k === null || k === undefined) return null;
  const key = String(k).trim().toLowerCase();
  if (!key) return null;
  return BY_KEY.get(ALIASES[key] || key) || null;
}

/** أسئلة الموضوع بالترتيب (قد تكون فاضية) */
export function flowFor(key) {
  const t = topicByKey(key);
  return t ? t.questions.slice() : [];
}

/** يُبقي أسئلة الموضوع فقط، وقيمها المعروفة أو 'unknown'، بحد أقصى 6؛ ويُسقط الباقي بصمت */
export function sanitizeAnswers(key, answers) {
  const out = {};
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return out;
  let n = 0;
  for (const id of flowFor(key)) {
    if (n >= MAX_ANSWERS) break;
    if (!Object.prototype.hasOwnProperty.call(answers, id)) continue;
    const raw = answers[id];
    if (raw === null || raw === undefined || typeof raw === 'object') continue;
    const v = String(raw).trim();
    const q = QUESTIONS[id];
    if (!q) continue;
    if (v === UNKNOWN.value || q.answers.some((x) => x.value === v)) {
      out[id] = v;
      n += 1;
    }
  }
  return out;
}

/** ما يُستنتج من الإجابات (الحقول التي تبعتها المستفيدة صراحةً تغلب عليه) */
export function infer(answers) {
  const r = {};
  const x = answers && typeof answers === 'object' ? answers : {};
  if (x['inh.deceased'] === 'husband' || x['pen.whose'] === 'husband' || x['alimony.father'] === 'deceased') r.relation = 'widow';
  else if (x['alimony.father'] === 'divorced') r.relation = 'divorced';
  const n = Number(x.children);
  if (['1', '2', '3', '4'].includes(String(x.children)) && Number.isInteger(n)) r.children_count = n;
  if (['rented_old', 'rented_new', 'owned', 'family'].includes(x['rent.home'])) r.housing = x['rent.home'];
  if (x['rent.evict'] === 'yes') r.urgent_hint = true;
  return r;
}

function answerStaff(id, value) {
  if (value === UNKNOWN.value) return UNKNOWN.staff;
  const q = QUESTIONS[id];
  const ans = q && q.answers.find((x) => x.value === String(value));
  return ans ? ans.staff : null;
}

/** سطور للإدارة (فصحى) من form_answers: الموضوع، ثم الإجابات بترتيب الأسئلة، ثم وقت المكالمة إن طُلبت */
export function staffLines(form) {
  let f = form;
  if (typeof f === 'string') {
    try {
      f = JSON.parse(f);
    } catch {
      f = null;
    }
  }
  if (!f || typeof f !== 'object') return [];
  const lines = [];
  const t = topicByKey(f.topic);
  if (t) lines.push(`الموضوع: ${t.staff}`);
  const answers = f.answers && typeof f.answers === 'object' ? f.answers : {};
  const order = t ? t.questions : Object.keys(QUESTIONS);
  for (const id of order) {
    if (!Object.prototype.hasOwnProperty.call(answers, id)) continue;
    const staff = answerStaff(id, answers[id]);
    if (staff) lines.push(`${QUESTIONS[id].staff_title}: ${staff}`);
  }
  const when = f.callback && CALLBACK_WHEN[f.callback];
  if (when) lines.push(`طلبت مكالمة: ${when.staff}`);
  return lines;
}

/** نص واتساب الجاهز لموضوع: «السلام عليكم، عندي مشكلة في الورث.»؛ «حاجة تانية» (أو بلا موضوع) = التحية العامة */
export function waPrefill(key, orgName) {
  const t = topicByKey(key);
  if (t && t.wa_phrase) return `${WA_PREFILL}${t.wa_phrase}.`;
  const org = String(orgName || '').trim() || 'مؤسسة بيوت مصر';
  return `السلام عليكم ${org}، عايزة أحكيلكم مشكلتي.`;
}

const norm = (s) =>
  String(s ?? '')
    .normalize('NFC')
    .replace(/[ـً-ٰٟ‌-‏‪-‮]/g, '')
    .replace(/,/g, '،')
    .replace(/\s+/g, ' ')
    .trim();

/** أول رسالة واتساب = النص الجاهز لموضوع بالضبط (بلا أي كلام زيادة) ← مفتاح الموضوع، وإلا null */
export function topicFromWaPrefill(text) {
  const s = norm(text);
  if (!s || s.length > 80) return null;
  const head = norm(WA_PREFILL);
  if (!s.startsWith(`${head} `)) return null;
  const rest = s.slice(head.length + 1).replace(/\s*\.$/, '');
  for (const t of TOPICS) {
    if (t.wa_phrase && norm(t.wa_phrase) === rest) return t.key;
  }
  return null;
}

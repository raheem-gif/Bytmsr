// v9.1 b-forms — بيانات تجريبية لنموذج الطلب الجديد: طلبان من الموقع، أحدهما برسالة صوتية وصورة ورقة فقط
// (بلا كتابة، كما ترسله أغلب المستفيدات)، والآخر برسالة صوتية وجملة مكتوبة. تظهر الرسالة الصوتية للإدارة
// كمشغّل صوت في المحادثة وقائمة المستندات، ولا تدخل في «كل المستندات» عند الإسناد لمحامٍ.
import fs from 'node:fs';
import path from 'node:path';
import { sourceFromWebAttribution } from './channels/engine.js';

const ASSETS = path.join(path.dirname(new URL(import.meta.url).pathname), 'seed-assets');
const b64 = (file) => fs.readFileSync(path.join(ASSETS, file)).toString('base64');

/**
 * @param {object} app
 * @param {{ at: (daysAgo:number, hour?:number, minute?:number) => void }} ctx  ساعة البيانات التجريبية من seed.js
 */
export function seedFormsDemo(app, { at }) {
  const voice = b64('v91-voice-note.webm');
  const photo = b64('v91-death-certificate.jpg');
  const stories = [
    {
      daysAgo: 0,
      hour: 9,
      phone: '01155660011',
      name: 'أم ياسين',
      gov: 'القليوبية',
      area: 'PEN',
      text: '[رسالة صوتية]',
      attachments: [
        { filename: 'ورقة-1.jpg', mime: 'image/jpeg', data_base64: photo },
        { filename: 'رسالة-صوتية-1.webm', mime: 'audio/webm', data_base64: voice },
      ],
      beneficiary: { relation: 'widow', children_count: 3 },
    },
    {
      daysAgo: 1,
      hour: 20,
      phone: '01266770022',
      name: 'سماح عبد الرحمن',
      gov: 'الجيزة',
      area: 'INH',
      text: 'جوزي مات ومعاش',
      attachments: [{ filename: 'رسالة-صوتية-1.webm', mime: 'audio/webm', data_base64: voice }],
      beneficiary: { relation: 'widow', children_count: 2 },
    },
  ];
  for (const s of stories) {
    at(s.daysAgo, s.hour, 15);
    const attribution = sourceFromWebAttribution({ landing_path: '/intake', utm_source: 'facebook', utm_medium: 'social' });
    attribution.detail = { ...attribution.detail, intake_mode: 'form' };
    const r = app.engine.receive({
      channel: 'website',
      from_phone: s.phone,
      contact_name: s.name,
      governorate: s.gov,
      text: s.text,
      attachments: s.attachments,
      attribution,
      legal_area_hint: s.area,
      force_new_intake: true,
      intake_kind: 'consultation',
    });
    if (app.practice && s.beneficiary) {
      const b = app.practice.beneficiary.validatePublic(s.beneficiary);
      if (b) app.practice.beneficiary.savePublic(r.intake, r.client, b, { createdClient: !!r.created_client });
    }
    app.clients.issuePortalToken(r.client.id, { intakeId: r.intake.id });
  }
}

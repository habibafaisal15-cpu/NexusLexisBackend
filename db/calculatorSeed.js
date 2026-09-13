/**
 * Seed catalogue for Knowledge Bank calculators — NL-BE-KB-CALC-001
 * Admins do not create/delete these ids. Only replace payload + toggle live/draft.
 * After first seed, admin PUTs are source of truth (never re-overwrite on deploy).
 */

export const CALCULATOR_IDS = Object.freeze([
  'court', 'wht', 'stamp', 'tax', 'business', 'inherit', 'limit', 'secp',
]);

/** Stable group definitions: id → kind (changing kind without seed change → 422) */
export const CALCULATOR_GROUP_KINDS = Object.freeze({
  court: {
    civil: 'adValorem',
    criminal: 'fixed',
    documents: 'itemList',
    family: 'itemList',
  },
  wht: {
    purchase: 'whtBands',
    sale: 'whtBands',
  },
  stamp: {
    instruments: 'infoList',
    deeds: 'infoList',
    agri: 'infoList',
    other: 'infoList',
  },
  tax: {
    salarySlabs: 'slabList',
  },
  business: {
    businessSlabs: 'slabList',
  },
  inherit: {
    note: 'note',
  },
  limit: {
    causes: 'limitList',
  },
  secp: {
    incorp: 'incorpFee',
    services: 'serviceList',
  },
});

const ITEM_REQUIRED = Object.freeze({
  itemList: ['id', 'label', 'fee'],
  whtBands: ['id', 'label', 'from', 'up', 'filer', 'non'],
  infoList: ['id', 'article', 'label', 'rate'],
  slabList: ['id', 'label', 'from', 'up', 'ratePercent', 'base'],
  limitList: ['id', 'category', 'art', 'label', 'period', 'years', 'months', 'days', 'startFrom'],
  serviceList: ['id', 'label', 'govt'],
});

const FIELDS_REQUIRED = Object.freeze({
  adValorem: ['exemptUpto', 'ratePercent', 'maxFee'],
  fixed: ['fee'],
  percent: ['ratePercent'],
  filerRates: ['filer', 'non'],
  incorpFee: ['lotSize', 'firstOnline', 'firstOffline', 'extraOnline', 'extraOffline'],
  note: [],
  itemList: [],
  whtBands: [],
  infoList: [],
  slabList: [], // surchargeFrom/Percent optional on business
  limitList: [],
  serviceList: [],
});

export function requiredItemKeys(kind) {
  return ITEM_REQUIRED[kind] || null;
}

export function requiredFieldKeys(kind) {
  return FIELDS_REQUIRED[kind] ?? null;
}

export function listKinds() {
  return Object.keys(ITEM_REQUIRED).concat(
    Object.keys(FIELDS_REQUIRED).filter((k) => !(k in ITEM_REQUIRED))
  );
}

/** Default schedules — first-deploy seed only */
export function getDefaultCalculatorSchedules() {
  return [
    {
      id: 'court',
      title: 'Court fee',
      subtitle: 'Civil, criminal & document court fees',
      status: 'live',
      hint: 'Ad-valorem civil fees apply above the exemption threshold.',
      note: null,
      resource: null,
      groups: [
        {
          id: 'civil',
          title: 'Civil (ad-valorem)',
          kind: 'adValorem',
          hint: null,
          fields: { exemptUpto: 25000, ratePercent: 7.5, maxFee: 15000 },
          items: [],
        },
        {
          id: 'criminal',
          title: 'Criminal (fixed)',
          kind: 'fixed',
          hint: null,
          fields: { fee: 0 },
          items: [],
        },
        {
          id: 'documents',
          title: 'Documents',
          kind: 'itemList',
          itemFeeKey: 'fee',
          hint: null,
          fields: {},
          items: [
            { id: 'civilVakalatnama', label: 'Civil Vakalatnama', fee: 100 },
            { id: 'criminalVakalatnama', label: 'Criminal Vakalatnama', fee: 50 },
          ],
        },
        {
          id: 'family',
          title: 'Family',
          kind: 'itemList',
          itemFeeKey: 'fee',
          hint: null,
          fields: {},
          items: [
            { id: 'divorcePetition', label: 'Divorce petition', fee: 500 },
          ],
        },
      ],
    },
    {
      id: 'wht',
      title: 'Property withholding',
      subtitle: 'Purchase & sale WHT bands',
      status: 'live',
      hint: 'up = 0 means open-ended (no upper cap).',
      note: null,
      resource: null,
      groups: [
        {
          id: 'purchase',
          title: 'Purchase',
          kind: 'whtBands',
          hint: null,
          fields: {},
          items: [
            { id: 'p1', label: 'Up to 50M', from: 0, up: 50000000, filer: 1, non: 10 },
            { id: 'p2', label: '50M – 100M', from: 50000000, up: 100000000, filer: 1.25, non: 15 },
            { id: 'p100plus', label: 'Above 100M', from: 100000000, up: 0, filer: 1.25, non: 18.5 },
          ],
        },
        {
          id: 'sale',
          title: 'Sale',
          kind: 'whtBands',
          hint: null,
          fields: {},
          items: [
            { id: 's1', label: 'Up to 50M', from: 0, up: 50000000, filer: 1, non: 10 },
            { id: 's2', label: 'Above 50M', from: 50000000, up: 0, filer: 1.5, non: 15 },
          ],
        },
      ],
    },
    {
      id: 'stamp',
      title: 'Stamp duty',
      subtitle: 'Instruments, deeds & other rates',
      status: 'live',
      hint: 'Rates are published text; may include newlines.',
      note: 'Confirm e-stamp / provincial notification before relying on these rates.',
      resource: null,
      groups: [
        {
          id: 'instruments',
          title: 'Instruments',
          kind: 'infoList',
          hint: null,
          fields: {},
          items: [
            { id: 'st-poa', article: 'Art. 48', label: 'Power of Attorney', rate: '2% of consideration\nor as notified' },
            { id: 'st-lease', article: 'Art. 35', label: 'Lease', rate: 'As per provincial schedule' },
          ],
        },
        {
          id: 'deeds',
          title: 'Deeds',
          kind: 'infoList',
          hint: null,
          fields: {},
          items: [
            { id: 'st-sale', article: 'Art. 23', label: 'Sale deed', rate: 'Provincial ad-valorem' },
          ],
        },
        {
          id: 'agri',
          title: 'Agricultural',
          kind: 'infoList',
          hint: null,
          fields: {},
          items: [
            { id: 'st-agri', article: '—', label: 'Agri land transfer', rate: 'See local board' },
          ],
        },
        {
          id: 'other',
          title: 'Other',
          kind: 'infoList',
          hint: null,
          fields: {},
          items: [
            { id: 'st-aff', article: 'Art. 4', label: 'Affidavit', rate: 'Fixed provincial fee' },
          ],
        },
      ],
    },
    {
      id: 'tax',
      title: 'Income tax (salary)',
      subtitle: 'Salary tax slabs',
      status: 'live',
      hint: 'up = 0 means no upper cap.',
      note: null,
      resource: {
        heading: 'For further information',
        fileName: 'WithholdingTaxRatesCard2027.pdf',
        url: '',
      },
      groups: [
        {
          id: 'salarySlabs',
          title: 'Salary slabs',
          kind: 'slabList',
          hint: null,
          fields: {},
          items: [
            { id: 'sy1', label: 'Nil', from: 0, up: 600000, ratePercent: 0, base: 0 },
            { id: 'sy2', label: 'Next band', from: 600000, up: 1200000, ratePercent: 5, base: 0 },
            { id: 'sy3', label: 'Open', from: 1200000, up: 0, ratePercent: 15, base: 30000 },
          ],
        },
      ],
    },
    {
      id: 'business',
      title: 'Business tax',
      subtitle: 'Business income slabs + surcharge',
      status: 'live',
      hint: 'Surcharge lives on the slab group fields.',
      note: null,
      resource: {
        heading: 'For further information',
        fileName: 'WithholdingTaxRatesCard2027.pdf',
        url: '',
      },
      groups: [
        {
          id: 'businessSlabs',
          title: 'Business slabs',
          kind: 'slabList',
          hint: null,
          fields: { surchargeFrom: 10000000, surchargePercent: 10 },
          items: [
            { id: 'by1', label: 'Nil band', from: 0, up: 600000, ratePercent: 0, base: 0 },
            { id: 'by2', label: 'Open', from: 600000, up: 0, ratePercent: 15, base: 0 },
          ],
        },
      ],
    },
    {
      id: 'inherit',
      title: 'Inheritance',
      subtitle: 'Rule engine stays on the frontend',
      status: 'live',
      hint: 'No numeric table — chrome fields only.',
      note: null,
      resource: null,
      groups: [
        {
          id: 'note',
          title: 'Notes',
          kind: 'note',
          hint: 'Inheritance calculator logic runs in the browser.',
          fields: {},
          items: [],
        },
      ],
    },
    {
      id: 'limit',
      title: 'Limitation',
      subtitle: 'Filing deadlines under 1908 Act',
      status: 'live',
      hint: 'Quick reference for filing deadlines.',
      note: null,
      resource: null,
      groups: [
        {
          id: 'causes',
          title: 'Articles & Limitation Periods',
          kind: 'limitList',
          hint: null,
          fields: {},
          items: [
            {
              id: 'art-2',
              category: 'TORT',
              art: 'Art. 2',
              label: 'For compensation for injury',
              period: '1 year',
              years: 1,
              months: 0,
              days: 0,
              startFrom: 'Date of injury',
              notes: '',
            },
            {
              id: 'art-113',
              category: 'CONTRACT',
              art: 'Art. 113',
              label: 'Specific performance',
              period: '3 years',
              years: 3,
              months: 0,
              days: 0,
              startFrom: 'Date fixed for performance',
            },
          ],
        },
      ],
    },
    {
      id: 'secp',
      title: 'SECP / FBR fees',
      subtitle: 'Incorporation lot fees & services',
      status: 'live',
      hint: null,
      note: null,
      resource: null,
      groups: [
        {
          id: 'incorp',
          title: 'Incorporation',
          kind: 'incorpFee',
          hint: null,
          fields: {
            lotSize: 100000,
            firstOnline: 1000,
            firstOffline: 1500,
            extraOnline: 500,
            extraOffline: 750,
          },
          items: [],
        },
        {
          id: 'services',
          title: 'Services',
          kind: 'serviceList',
          hint: null,
          fields: {},
          items: [
            { id: 'name-reserve', label: 'Name reservation', govt: 200 },
            { id: 'incorp-svc', label: 'Company incorporation', govt: 0, calc: 'incorp' },
          ],
        },
      ],
    },
  ];
}

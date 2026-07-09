import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');
const DATA_FILE = join(DATA_DIR, 'workspace.json');

const DEFAULT_DATA = {
  stats: {
    activeOrders: 2,
    appointments: 1,
    retainerTier: 'Growth',
    unreadMessages: 3
  },
  notifications: [
    { id: 1, text: 'SECP incorporation draft reviewed by Advocate Mian Ali Raza.', route: '/account/orders' },
    { id: 2, text: 'New confidential advisory opinion filed under matter ledger.', route: '/account/vlo' }
  ],
  activities: [
    { id: 'act-1', type: 'booking', langKey: 'Booked', params: { name: 'Adv. Zameeruddin Ahmed' }, timestamp: '2026-07-09T18:00:00Z', timeAgo: '3 hours ago' },
    { id: 'act-2', type: 'order', langKey: 'DocStarted', params: { doc: 'SECP Incorporation Draft' }, timestamp: '2026-07-08T12:00:00Z', timeAgo: '1 day ago' },
    { id: 'act-3', type: 'matter', langKey: 'UploadMatter', params: { title: 'Joint Venture Vetting' }, timestamp: '2026-07-07T10:00:00Z', timeAgo: '2 days ago' }
  ],
  orders: [
    { id: '8910', templateId: 'secp_incorporation', templateName: 'SECP Company Articles Draft', status: 'Completed', date: '2026-07-08' },
    { id: '5561', templateId: 'tenancy_agreement', templateName: 'Tenancy Lease Contract', status: 'In Progress', date: '2026-07-09' }
  ],
  matters: [
    {
      id: 'm-1',
      title: 'Joint Venture Vetting (TechCorp Partnership)',
      status: 'Opinion Rendered',
      date: '2026-07-07',
      description: 'Vetting of a joint venture agreement relating to shared data center facilities. Critical clauses focus on liability limit cap and dispute resolutions under arbitration.',
      opinion: 'Opinion: The data localization clauses are compliant with draft regulations. We recommend reducing the liability cap under clause 14 to PKR 15 Million matching default indemnity bounds.',
      attachment: 'JV_Vetting_Opinion_Signed.pdf'
    },
    {
      id: 'm-2',
      title: 'Board Resolution Approval (FY26 Capital Allocations)',
      status: 'Awaiting Review',
      date: '2026-07-09',
      description: 'Corporate validation for internal equity allocation structures. Involves foreign national director authorizations.'
    }
  ],
  threads: [
    {
      id: 't-1',
      lawyerName: 'Adv. Mian Ali Raza',
      lawyerImage: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=128',
      lastMessage: 'Let me double check the draft lease provisions.',
      lastUpdated: '10 mins ago',
      messages: [
        { id: 1, sender: 'user', text: 'Salams advocate, did you verify the landlord title?', timestamp: '04:12 PM' },
        { id: 2, sender: 'lawyer', text: 'Yes. Checked the local registry. The title is verified. Let me double check the draft lease provisions.', timestamp: '04:15 PM' }
      ]
    },
    {
      id: 't-2',
      lawyerName: 'Adv. Aisha Chaudhry',
      lawyerImage: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=128',
      lastMessage: 'Trademark class 35 filing has been submitted.',
      lastUpdated: '2 hours ago',
      messages: [
        { id: 1, sender: 'lawyer', text: 'Trademark class 35 filing has been submitted.', timestamp: '02:00 PM' }
      ]
    }
  ],
  subscription: {
    planName: 'Growth Retainer Plan',
    price: 'Rs. 45,000',
    nextBillingDate: '2026-08-01'
  },
  invoices: [
    { id: 'INV-2026-001', category: 'Growth Retainer Plan (Monthly Subscription)', date: '2026-07-01', price: 'Rs. 45,000' },
    { id: 'INV-2026-002', category: 'SECP Articles of Association Prep (Document Pack)', date: '2026-07-05', price: 'Rs. 12,000' }
  ],
  lawyers: [
    {
      id: '1',
      name: 'Mian Ali Raza',
      city: 'Lahore',
      practiceArea: 'Corporate law',
      language: 'English',
      stars: 5,
      bio: 'Advocate High Court. Specializes in corporate restructuring, SECP filings, and tax litigation with over 12 years of experience.',
      onlineFee: 'Rs. 4,500',
      inPersonFee: 'Rs. 8,000',
      image: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=256'
    },
    {
      id: '2',
      name: 'Aisha Chaudhry',
      city: 'Islamabad',
      practiceArea: 'Intellectual property',
      language: 'English',
      stars: 4.8,
      bio: 'IP legal specialist representing global brands in patent registration, copyright disputes, and trademark enforcement under IPO Pakistan regulations.',
      onlineFee: 'Rs. 3,500',
      inPersonFee: 'Rs. 6,000',
      image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=256'
    },
    {
      id: '3',
      name: 'Zameeruddin Ahmed',
      city: 'Karachi',
      practiceArea: 'Property law',
      language: 'Urdu',
      stars: 4.9,
      bio: 'Expert civil advocate focusing on partition suits, property disputes, Land Revenue Act compliance, and Power of Attorney validation.',
      onlineFee: 'Rs. 5,000',
      inPersonFee: 'Rs. 10,000',
      image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=256'
    },
    {
      id: '4',
      name: 'Sanaullah Khan',
      city: 'Peshawar',
      practiceArea: 'Family law',
      language: 'Urdu',
      stars: 4.7,
      bio: 'Advocate specializing in family settlement, child custody disputes, divorce filings, and inheritance allocations according to local statutes.',
      onlineFee: 'Rs. 3,000',
      inPersonFee: 'Rs. 5,000',
      image: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&q=80&w=256'
    }
  ],
  nextNotificationId: 3,
  nextOrderId: 9000
};

let data = null;

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadStore() {
  ensureDataDir();
  if (existsSync(DATA_FILE)) {
    data = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  } else {
    data = structuredClone(DEFAULT_DATA);
    saveStore();
  }
  return data;
}

export function getStore() {
  if (!data) loadStore();
  return data;
}

export function saveStore() {
  ensureDataDir();
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export function getWorkspace() {
  const store = getStore();
  return {
    stats: store.stats,
    notifications: store.notifications,
    activities: store.activities,
    orders: store.orders,
    matters: store.matters,
    threads: store.threads,
    subscription: store.subscription,
    invoices: store.invoices,
    lawyers: store.lawyers
  };
}

export function addActivity(activity) {
  const store = getStore();
  store.activities.unshift(activity);
  saveStore();
}

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
  lawyers: [],
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

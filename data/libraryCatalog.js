/** Document library catalog — seeded into service_categories + services on startup. */
export const LIBRARY_CATEGORIES = [
  {
    name: 'Corporate & Business',
    slug: 'corporate-business',
    description: 'Company registration, compliance, and business agreements.',
    icon: 'briefcase',
    displayOrder: 1,
    templates: [
      { name: 'Private Limited Company Registration', slug: 'pvt-ltd-registration', price: 45000, deliveryDays: 14 },
      { name: 'Partnership Deed', slug: 'partnership-deed', price: 15000, deliveryDays: 5 },
      { name: 'Memorandum of Association', slug: 'moa', price: 20000, deliveryDays: 7 },
    ],
  },
  {
    name: 'Property & Real Estate',
    slug: 'property-real-estate',
    description: 'Sale agreements, leases, and property documentation.',
    icon: 'home',
    displayOrder: 2,
    templates: [
      { name: 'Sale Agreement', slug: 'sale-agreement', price: 12000, deliveryDays: 3 },
      { name: 'Rental / Lease Agreement', slug: 'lease-agreement', price: 8000, deliveryDays: 2 },
      { name: 'Power of Attorney (Property)', slug: 'poa-property', price: 10000, deliveryDays: 3 },
    ],
  },
  {
    name: 'Document Services',
    slug: 'document-services',
    description: 'General legal documents and affidavits.',
    icon: 'file-text',
    displayOrder: 3,
    templates: [
      { name: 'Affidavit', slug: 'affidavit', price: 5000, deliveryDays: 2 },
      { name: 'Legal Notice', slug: 'legal-notice', price: 15000, deliveryDays: 3 },
      { name: 'Employment Contract', slug: 'employment-contract', price: 12000, deliveryDays: 4 },
    ],
  },
];

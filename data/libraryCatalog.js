/** Document library catalog — seeded into service_categories + services on startup.
 *  accessType: 'paid' = client Library (orderable), 'public' = Knowledge Bank (free).
 */
export const LIBRARY_CATEGORIES = [
  {
    name: 'Corporate & Business',
    slug: 'corporate-business',
    description: 'Company registration, compliance, and business agreements.',
    icon: 'briefcase',
    displayOrder: 1,
    templates: [
      { name: 'Private Limited Company Registration', slug: 'pvt-ltd-registration', price: 45000, deliveryDays: 14, accessType: 'paid' },
      { name: 'Partnership Deed', slug: 'partnership-deed', price: 15000, deliveryDays: 5, accessType: 'paid' },
      { name: 'Memorandum of Association', slug: 'moa', price: 20000, deliveryDays: 7, accessType: 'paid' },
    ],
  },
  {
    name: 'Property & Real Estate',
    slug: 'property-real-estate',
    description: 'Sale agreements, leases, and property documentation.',
    icon: 'home',
    displayOrder: 2,
    templates: [
      { name: 'Sale Agreement', slug: 'sale-agreement', price: 12000, deliveryDays: 3, accessType: 'paid' },
      { name: 'Rental / Lease Agreement', slug: 'lease-agreement', price: 8000, deliveryDays: 2, accessType: 'paid' },
      { name: 'Power of Attorney (Property)', slug: 'poa-property', price: 10000, deliveryDays: 3, accessType: 'paid' },
    ],
  },
  {
    name: 'Document Services',
    slug: 'document-services',
    description: 'General legal documents and affidavits.',
    icon: 'file-text',
    displayOrder: 3,
    templates: [
      { name: 'Affidavit', slug: 'affidavit', price: 5000, deliveryDays: 2, accessType: 'paid' },
      { name: 'Legal Notice', slug: 'legal-notice', price: 15000, deliveryDays: 3, accessType: 'paid' },
      { name: 'Employment Contract', slug: 'employment-contract', price: 12000, deliveryDays: 4, accessType: 'paid' },
    ],
  },
  {
    name: 'Knowledge Bank',
    slug: 'knowledge-bank',
    description: 'Free public templates and legal guides.',
    icon: 'book-open',
    displayOrder: 4,
    templates: [
      { name: 'Sample Affidavit Guide', slug: 'kb-sample-affidavit', price: 0, deliveryDays: 0, accessType: 'public' },
      { name: 'Basic NDA Overview', slug: 'kb-nda-overview', price: 0, deliveryDays: 0, accessType: 'public' },
    ],
  },
];

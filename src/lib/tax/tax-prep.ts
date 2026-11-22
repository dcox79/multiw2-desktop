import type {
  Job,
  JobW2Entry,
  TaxPrepDocument,
} from '../types';

// Document categories for grouping
export type DocumentCategory = 'employment' | 'income' | 'deductions' | 'reference';

interface DocumentTemplate {
  documentType: string;
  documentName: string;
  category: DocumentCategory;
  employerName?: string;
  jobId?: string;
}

/**
 * Auto-generates a document checklist based on the user's jobs and W2 entries.
 * Cross-references with existing tracked documents to preserve their status.
 */
export function generateDocumentChecklist(
  jobs: Job[],
  w2Entries: JobW2Entry[],
  existingDocuments: TaxPrepDocument[],
  taxYear: number,
): TaxPrepDocument[] {
  const templates: DocumentTemplate[] = [];

  // Per-job documents
  for (const job of jobs) {
    // W-2 for each job
    templates.push({
      documentType: 'w2',
      documentName: `W-2 from ${job.name}`,
      category: 'employment',
      employerName: job.name,
      jobId: job.id,
    });

    // Check for HSA contributions (Box 12 Code W)
    const w2 = w2Entries.find((e) => e.job_id === job.id && e.tax_year === taxYear);
    if (w2 && w2.box12_code_w && w2.box12_code_w > 0) {
      templates.push({
        documentType: 'form_8889',
        documentName: `Form 8889 — HSA (${job.name})`,
        category: 'employment',
        employerName: job.name,
      });
    }
  }

  // Standard documents for all filers
  const standardDocs: DocumentTemplate[] = [
    { documentType: '1099_int', documentName: '1099-INT — Bank Interest', category: 'income' },
    { documentType: '1099_div', documentName: '1099-DIV — Dividends', category: 'income' },
    { documentType: '1098', documentName: '1098 — Mortgage Interest', category: 'deductions' },
    { documentType: 'charitable', documentName: 'Charitable Donation Receipts', category: 'deductions' },
    { documentType: 'property_tax', documentName: 'Property Tax Records', category: 'deductions' },
    { documentType: '1098_e', documentName: '1098-E — Student Loan Interest', category: 'deductions' },
    { documentType: 'medical', documentName: 'Medical Expense Records', category: 'deductions' },
    { documentType: 'prior_return', documentName: `${taxYear - 1} Tax Return`, category: 'reference' },
  ];

  templates.push(...standardDocs);

  // Build the document list, cross-referencing with existing tracked documents
  const documents: TaxPrepDocument[] = [];
  const now = new Date().toISOString();

  for (const tmpl of templates) {
    // Check if already tracked
    const existing = existingDocuments.find(
      (d) => d.documentType === tmpl.documentType
        && d.taxYear === taxYear
        && (tmpl.employerName ? d.employerName === tmpl.employerName : true),
    );

    if (existing) {
      documents.push(existing);
      continue;
    }

    // Auto-mark W-2 as received if W2 entry exists in the system
    let autoStatus: TaxPrepDocument['status'] = 'needed';
    if (tmpl.documentType === 'w2' && tmpl.jobId) {
      const hasW2Entry = w2Entries.some(
        (e) => e.job_id === tmpl.jobId && e.tax_year === taxYear,
      );
      if (hasW2Entry) autoStatus = 'received';
    }

    documents.push({
      id: '', // Will be assigned by DB on insert
      userId: '',
      taxYear,
      documentType: tmpl.documentType,
      documentName: tmpl.documentName,
      employerName: tmpl.employerName,
      status: autoStatus,
      createdAt: now,
      updatedAt: now,
    });
  }

  const includedIds = new Set(documents.map(document => document.id));
  return [...documents, ...existingDocuments.filter(document => document.taxYear === taxYear && !includedIds.has(document.id))];
}

/**
 * Returns the document category for grouping in the UI.
 */
export function getDocumentCategory(docType: string): DocumentCategory {
  if (['w2', 'form_8889'].includes(docType)) return 'employment';
  if (['1099_int', '1099_div'].includes(docType)) return 'income';
  if (['1098', 'charitable', 'property_tax', '1098_e', 'medical'].includes(docType)) return 'deductions';
  return 'reference';
}

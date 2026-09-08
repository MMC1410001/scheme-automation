export interface UploadSlot {
  id: string;
  name: string;
  bucketPath: string;
  allowedFormats: string[];
  maxSizeInBytes: number;
  multiple?: boolean;
  maxFiles?: number;
  optional?: boolean;
  bigQueryTableId?: string;
  comparisonTableIds?: string[];
}

export const schemeAutomationSlots: UploadSlot[] = [
  {
    id: "revised_product",
    name: "Product Attributes",
    bucketPath: "product_attribute",
    allowedFormats: [".xlsx", ".xls", ".csv"],
    maxSizeInBytes: 500 * 1024 * 1024,
  },
  {
    id: "revised_parent_child",
    name: "Parent Child Mapping",
    bucketPath: "parent_child",
    bigQueryTableId: "parent_child",
    allowedFormats: [".xlsx", ".xls", ".csv"],
    maxSizeInBytes: 500 * 1024 * 1024,
  },
  {
    id: "revised_customer",
    name: "Customer Attributes",
    bucketPath: "customer_attribute",
    allowedFormats: [".xlsx", ".xls", ".csv"],
    maxSizeInBytes: 500 * 1024 * 1024,
    optional: true,
  },
  {
    id: "revised_trial_",
    name: "Trial vs Commercial Run",
    bucketPath: "trial_vs_commercial",
    allowedFormats: [".xlsx", ".xls", ".csv"],
    maxSizeInBytes: 500 * 1024 * 1024,
    optional: true,
  },
  {
    id: "revised_sales_fn",
    name: "Deferred Sales",
    bucketPath: "deferred_sales",
    allowedFormats: [".xlsx", ".xls", ".csv"],
    maxSizeInBytes: 500 * 1024 * 1024,
    optional: true,
  },
  {
    id: "revised_cash_discount",
    name: "Cash Discount Adjustment",
    bucketPath: "cash_discount_adj",
    allowedFormats: [".xlsx", ".xls", ".csv"],
    maxSizeInBytes: 500 * 1024 * 1024,
  },
  {
    id: "revised_billing_extract",
    name: "Billing Extract",
    bucketPath: "billing_extract",
    allowedFormats: [".xlsx", ".xls", ".csv"],
    maxSizeInBytes: 500 * 1024 * 1024,
    multiple: true,
    maxFiles: 10,
  },
];

export const clientSectionSlots: UploadSlot[] = [
  {
    id: "revised_incentive_scheme",
    name: "Incentive Scheme Eligible SKU",
    bucketPath: "incentive_scheme_sku",
    bigQueryTableId: "incentive_scheme_sku",
    allowedFormats: [".xlsx", ".xls", ".csv"],
    maxSizeInBytes: 500 * 1024 * 1024,
    optional: true,
  },
  {
    id: "revised_category_b",
    name: "Category B SKU Mapping",
    bucketPath: "category_b_sku",
    bigQueryTableId: "category_b_sku",
    allowedFormats: [".xlsx", ".xls", ".csv"],
    maxSizeInBytes: 500 * 1024 * 1024,
    optional: true,
  },
  {
    id: "normal_loyalty",
    name: "Loyalty Points and Contractor",
    bucketPath: "contractor_loyalty",
    bigQueryTableId: "contractor_loyalty",
    allowedFormats: [".xlsx", ".xls", ".csv"],
    maxSizeInBytes: 500 * 1024 * 1024,
  },
  {
    id: "normal_sales_system",
    name: "Sales System Export",
    bucketPath: "sales_system_export",
    bigQueryTableId: "sales_system_export",
    allowedFormats: [".xlsx", ".xls", ".csv"],
    maxSizeInBytes: 500 * 1024 * 1024,
  },
  {
    id: "normal_franchise",
    name: "Mapping of Franchise",
    bucketPath: "mapping_of_franchise",
    bigQueryTableId: "mapping_of_franchise",
    allowedFormats: [".xlsx", ".xls", ".csv"],
    maxSizeInBytes: 500 * 1024 * 1024,
  },
  {
    id: "normal_working_file",
    name: "Final Scheme working",
    bucketPath: "working_file",
    bigQueryTableId: "working_file",
    comparisonTableIds: ["parent_child"],
    allowedFormats: [".xlsx", ".xls", ".csv"],
    maxSizeInBytes: 500 * 1024 * 1024,
  },
  {
    id: "normal_missed_inbill",
    name: "Missed In-bill Working",
    bucketPath: "missed_inbill",
    bigQueryTableId: "missed_inbill",
    allowedFormats: [".xlsx", ".xls", ".csv"],
    maxSizeInBytes: 500 * 1024 * 1024,
    optional: true,
    multiple: true,
    maxFiles: 5,
  },
  {
    id: "normal_scheme_folder",
    name: "Scheme working Base file",
    bucketPath: "scheme_mapping",
    bigQueryTableId: "scheme_mapping",
    allowedFormats: [".xlsx", ".xls", ".csv"],
    maxSizeInBytes: 500 * 1024 * 1024,
    multiple: true,
    maxFiles: 5,
  },
];

const TRAILING_NUM_PATTERN = /^(.*?)(\d+)$/;
const OPTIONAL_TRAILING_SUFFIX_PATTERN = /^(.*?)(?:_(\d+))?$/;

export const forwardFillHeaderRow = (values: string[]): string[] => {
  const filled: string[] = [];
  let lastValue = "";

  values.forEach((value, index) => {
    const cell = String(value || "").trim();
    if (cell) {
      lastValue = cell;
    }
    filled[index] = lastValue;
  });

  return filled;
};

export const cleanColumnName = (value: string): string => {
  let col = String(value || "").trim().toLowerCase();
  col = col.replace(/%/g, "").replace(/&/g, "");
  col = col.replace(/,/g, "_");
  col = col.replace(/[()]/g, "");
  col = col.replace(/[^a-z0-9]+/g, "_");
  col = col.replace(/_+/g, "_").replace(/^_+|_+$/g, "");

  const match = TRAILING_NUM_PATTERN.exec(col);
  if (match) {
    col = `${match[1]}_${match[2]}`;
  }

  if (col && /^\d/.test(col)) {
    col = `_${col}`;
  }

  return col;
};

export const removeDateTokens = (value: string): string => {
  const tokens = String(value || "").split("_");
  const cleaned: string[] = [];

  tokens.forEach((token, index) => {
    if (!token) return;
    if (/^\d{1,2}[a-z]{3}$/.test(token)) return;
    if (/^\d+[a-z]{2,}$/.test(token)) return;
    if (/^\d{1,2}-\d{1,2}[a-z]{2,}$/.test(token)) return;
    if (/^\d{1,2}_\d{1,2}[a-z]{2,}$/.test(token)) return;
    if (/^\d{1,2}_[a-z]{3}$/.test(token)) return;
    if (/^\d+$/.test(token) && index < tokens.length - 1) return;

    cleaned.push(token);
  });

  return cleaned.join("_");
};

export const finalizeColumnNames = (columns: string[]): string[] => {
  return finalizeColumnNamesWithOffset(columns, 1);
};

const stripTrailingDigitsFromToken = (token: string): string => {
  if (!token || !/[a-z]/i.test(token) || !/\d/.test(token)) {
    return token;
  }

  return token.replace(/\d+$/g, "");
};

const addComparisonVariant = (variants: Set<string>, tokens: string[]): void => {
  const filteredTokens = tokens.filter(Boolean);
  if (!filteredTokens.length) {
    return;
  }

  const joined = filteredTokens.join("_");
  if (joined) {
    variants.add(joined);
  }

  for (let size = 1; size * 2 <= filteredTokens.length; size += 1) {
    const firstBlock = filteredTokens.slice(0, size).join("_");
    const secondBlock = filteredTokens.slice(size, size * 2).join("_");
    if (firstBlock && firstBlock === secondBlock) {
      const collapsed = [...filteredTokens.slice(0, size), ...filteredTokens.slice(size * 2)].join("_");
      if (collapsed) {
        variants.add(collapsed);
      }
    }
  }

  for (let index = 1; index < filteredTokens.length - 1; index += 1) {
    if (filteredTokens[index] === filteredTokens[0]) {
      const collapsed = [...filteredTokens.slice(0, index), ...filteredTokens.slice(index + 1)].join("_");
      if (collapsed) {
        variants.add(collapsed);
      }
    }
  }
};

export const finalizeColumnNamesWithOffset = (
  columns: string[],
  duplicateSuffixOffset = 1,
): string[] => {
  const seen = new Map<string, number>();
  const finalCols: string[] = [];

  columns.forEach((column) => {
    const cleaned = removeDateTokens(cleanColumnName(column));
    if (!cleaned) {
      finalCols.push("");
      return;
    }

    const base = OPTIONAL_TRAILING_SUFFIX_PATTERN.exec(cleaned)?.[1] || cleaned;
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    finalCols.push(
      count === 1 ? cleaned : `${base}_${count - 1 + duplicateSuffixOffset}`,
    );
  });

  return finalCols;
};

export const getComparisonKeyVariants = (value: string): string[] => {
  const normalized = removeDateTokens(cleanColumnName(value));
  if (!normalized) {
    return [];
  }

  const variants = new Set([normalized]);
  const tokens = normalized.split("_").filter(Boolean);

  const strippedNumericTokens = tokens.map(stripTrailingDigitsFromToken);
  const withoutPureNumericTokens = tokens.filter((token) => !/^\d+$/.test(token));
  const strippedWithoutPureNumericTokens = strippedNumericTokens.filter(
    (token) => !/^\d+$/.test(token),
  );

  addComparisonVariant(variants, tokens);
  addComparisonVariant(variants, strippedNumericTokens);
  addComparisonVariant(variants, withoutPureNumericTokens);
  addComparisonVariant(variants, strippedWithoutPureNumericTokens);

  return [...variants].filter(Boolean);
};

export const buildHierarchicalColumnNames = (
  parentRow: string[],
  childRow: string[],
  duplicateSuffixOffset = 1,
): string[] => {
  const maxLength = Math.max(parentRow.length, childRow.length);
  const merged: string[] = [];
  let currentParent = "";

  for (let index = 0; index < maxLength; index += 1) {
    const parentCell = String(parentRow[index] || "").trim();
    if (parentCell) {
      currentParent = parentCell;
    }

    const parent = currentParent;
    const child = String(childRow[index] || "").trim();

    if (parent && child) {
      merged.push(`${parent} ${child}`);
    } else {
      merged.push(child || parent);
    }
  }

  return finalizeColumnNamesWithOffset(merged, duplicateSuffixOffset);
};

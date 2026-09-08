import CryptoJS from "crypto-js";

export const decrypt = (cipherText: string, password: string): string => {
  if (!cipherText || !password) return "";
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, password);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);

    return originalText || "";
  } catch (error) {
    console.error("Decryption failed:", error);
    return "";
  }
};

import CryptoJS from "crypto-js";

export const encrypt = (text: string, password: string): string => {
  if (!text || !password) return "";
  return CryptoJS.AES.encrypt(text, password).toString();
};

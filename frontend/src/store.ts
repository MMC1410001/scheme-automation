import { configureStore } from "@reduxjs/toolkit";
import uploadReducer from "./page/uploadSlice";

export const store = configureStore({
  reducer: {
    upload: uploadReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: [
          "upload/uploadFile/fulfilled",
          "upload/uploadFile/pending",
          "upload/uploadFile/rejected",
          "upload/setFileStatus",
        ],
        // Ignore these field paths in all actions
        ignoredActionPaths: [
          "payload.file",
          "meta.arg.file",
          "payload.status.file",
        ],
        // Ignore these paths in the state
        ignoredPaths: ["upload.fileStatuses"],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: {
      fields?: Array<{
        path: string;
        code: string;
        message: string;
      }>;
    };
  };
}

declare module 'sql.js' {
  export type SqlJsStatic = any;
  export type Database = any;
  const initSqlJs: (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic> | any;
  export default initSqlJs;
}

declare module 'pg' {
  export class Client {
    constructor(config?: any);
    connect(): Promise<void>;
    query(text: string, params?: any[]): Promise<{ rows: any[] }>;
    end(): Promise<void>;
  }
}

declare module 'papaparse' {
  const Papa: any;
  export default Papa;
}

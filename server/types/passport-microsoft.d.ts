declare module 'passport-microsoft' {
  import { Strategy as PassportStrategy } from 'passport';
  
  interface MicrosoftStrategyOptions {
    clientID: string;
    clientSecret: string;
    callbackURL: string;
    scope?: string[];
    tenant?: string;
  }
  
  type VerifyCallback = (
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: (error: any, user?: any) => void
  ) => void;
  
  export class Strategy extends PassportStrategy {
    constructor(options: MicrosoftStrategyOptions, verify: VerifyCallback);
  }
}

import { AppUser } from './database';

export interface AuthState {
  user: AppUser | null;
  loading: boolean;
}

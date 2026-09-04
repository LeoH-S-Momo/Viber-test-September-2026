export interface AuthUserRole {
  key: 'PASSENGER' | 'ORGANIZER_ADMIN' | 'ORGANIZER_STAFF' | 'PLATFORM_ADMIN';
  organizerId: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  status: string;
  roles: AuthUserRole[];
}

export interface AuthResult {
  accessToken: string;
  user: AuthUser;
}

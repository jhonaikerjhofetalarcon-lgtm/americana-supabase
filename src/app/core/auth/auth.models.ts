export interface CurrentUser {
  readonly id: number;
  readonly username: string;
  readonly fullName: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
}

export interface LoginResponse {
  readonly accessToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresInSeconds: number;
  readonly user: CurrentUser;
}

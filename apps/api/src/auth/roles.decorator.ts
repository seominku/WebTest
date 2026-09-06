import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@real-estate/db';

export const ROLES_KEY = 'allowed-roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

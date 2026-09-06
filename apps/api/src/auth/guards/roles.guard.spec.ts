import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@real-estate/db';
import { Roles } from '../roles.decorator.js';
import { RolesGuard } from './roles.guard.js';

class GuardFixtureController {
  @Roles(UserRole.ADMIN)
  restricted(): void {}
}

function contextFor(role: UserRole): ExecutionContext {
  return {
    getHandler: () => GuardFixtureController.prototype.restricted,
    getClass: () => GuardFixtureController,
    switchToHttp: () => ({
      getRequest: () => ({ auth: { user: { role } } }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('allows a matching role and rejects a different role', () => {
    expect(guard.canActivate(contextFor(UserRole.ADMIN))).toBe(true);
    expect(() => guard.canActivate(contextFor(UserRole.USER))).toThrow(
      ForbiddenException,
    );
  });
});

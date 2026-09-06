import { validateEnvironment } from './environment.js';

describe('validateEnvironment', () => {
  it('accepts an explicitly disabled geocoding data-sharing flag', () => {
    expect(
      validateEnvironment({
        APP_ENV: 'local',
        GEOCODING_DATA_SHARING_APPROVED: 'false',
      }),
    ).toMatchObject({ GEOCODING_DATA_SHARING_APPROVED: 'false' });
  });

  it('rejects ambiguous geocoding data-sharing values', () => {
    expect(() =>
      validateEnvironment({
        APP_ENV: 'local',
        GEOCODING_DATA_SHARING_APPROVED: 'yes',
      }),
    ).toThrow('GEOCODING_DATA_SHARING_APPROVED must be true or false');
  });
});

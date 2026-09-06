import { GeocodingService } from './geocoding.service.js';

describe('GeocodingService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('does not transmit an address when approval is absent', async () => {
    vi.stubEnv('APP_ENV', 'local');
    vi.stubEnv('GEOCODING_BASE_URL', 'https://example.com/geocode');
    vi.stubEnv('GEOCODING_DATA_SHARING_APPROVED', 'false');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new GeocodingService().geocode({
        postalCode: '06236',
        roadAddress: '서울특별시 강남구 테헤란로 152',
      }),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

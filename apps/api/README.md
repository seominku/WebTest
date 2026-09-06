# Real Estate API

NestJS 기반 부동산 플랫폼 API입니다. PostgreSQL을 영속 데이터 기준으로 사용하고 Redis는 세션 캐시, MinIO는 S3 호환 객체 저장소로 사용합니다.

## 실행

저장소 루트에서 실행합니다.

```powershell
npm.cmd run docker:infra
npm.cmd run db:deploy
npm.cmd run dev
```

전체 Docker 스택은 `npm.cmd run docker:up`으로 실행합니다.

## 상태 확인

- `GET /api/v1/health/live`: API 프로세스 생존 여부
- `GET /api/v1/health/ready`: PostgreSQL·Redis·MinIO 실제 사용 가능 여부

## 인증

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `GET /api/v1/auth/csrf`
- `POST /api/v1/auth/logout`

로그인은 HttpOnly 쿠키의 서버 측 세션을 사용합니다. 로그아웃 요청에는 `GET /auth/csrf`로 받은 최신 토큰을 `X-CSRF-Token` 헤더에 넣어야 합니다. 신규 계정은 이메일 확인 전 상태로 생성되며, 일회용 확인 토큰을 소비한 뒤에만 로그인할 수 있습니다. 로컬·테스트 환경만 가입 응답에 확인 토큰을 제공하며 운영 환경에서는 메일 발송 어댑터가 토큰을 전달해야 합니다.

## 인증 요청 제한

- 회원가입: IP별 15분에 10회
- 이메일 확인: IP별 15분에 30회
- 로그인: IP별 15분에 60회, 이메일별 15분에 10회

카운터는 Redis의 원자적 고정 구간 연산을 사용합니다. IP와 이메일은 HMAC 지문으로 변환하므로 Redis 키에 원문을 남기지 않습니다. 제한을 넘으면 API는 `429`와 `Retry-After`를 반환합니다. Redis 장애 시 로컬·테스트는 개발 가능성을 위해 제한 검사를 건너뛰지만, 스테이징·운영은 보호 장치 없는 인증 요청을 허용하지 않고 `503`을 반환합니다.

프록시가 없는 환경은 `TRUST_PROXY_HOPS=0`을 사용합니다. 로드 밸런서 뒤에서는 실제 신뢰 프록시 홉 수를 명시해야 올바른 클라이언트 IP로 제한할 수 있습니다.

## 공개 매물

- `GET /api/v1/listings`: 목록, 페이지네이션, `transactionType`·`propertyType`·`sido`·`sigungu` 필터
- `GET /api/v1/listings/:id`: 공개 매물 상세

`PUBLISHED` 상태이고 게시 시각이 지났으며 만료·삭제되지 않은 매물만 반환합니다. 중개사무소·중개사·계정도 모두 활성 상태여야 합니다. 가격은 정밀도 손실을 막기 위해 원 단위 문자열로 직렬화하며, 도로명 주소는 주소 공개 수준이 `PUBLIC`일 때만 제공합니다.

로컬 가상 매물은 저장소 루트에서 `npm.cmd run db:seed`로 생성합니다. 고정 UUID의 데이터를 upsert하므로 여러 번 실행해도 중복 생성되지 않으며 운영 환경에서는 실행이 거부됩니다.

## 검증

```powershell
npm.cmd run test
npm.cmd run test:e2e
npm.cmd run test:integration
npm.cmd run test:smoke:auth
npm.cmd run test:smoke:listings
npm.cmd run typecheck
npm.cmd run lint
```

통합 테스트는 실행 중인 PostgreSQL·Redis·MinIO를 사용하며 테스트 계정과 관련 기록을 종료 전에 정리합니다.

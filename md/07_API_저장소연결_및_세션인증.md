---
title: API 저장소 연결 및 서버 측 세션 인증
created_at: "2026-09-04 02:45:01 KST"
updated_at: "2026-09-04 03:16:10 KST"
status: 1차 구현 완료
document_type: implementation-record
---

# API 저장소 연결 및 서버 측 세션 인증

## 작업 결과

NestJS API에 PostgreSQL·Redis·MinIO 정식 클라이언트를 연결하고 회원가입, 로그인, 현재 사용자 확인, 로그아웃을 구현했다. 신규 계정은 이메일 확인 전 상태로 생성되며, `ACTIVE` 상태의 계정만 로그인할 수 있다.

## 구성 요소의 역할과 필요한 이유

| 구성 요소 | 역할 | 필요한 이유 |
|---|---|---|
| `PrismaService` | 타입 안전한 PostgreSQL 조회와 트랜잭션 제공 | 계정·세션·감사 기록을 일관된 단위로 저장하기 위해 필요 |
| `RedisService` | 세션 조회 결과를 최대 60초 캐시 | 반복 요청의 DB 부하를 줄이되 계정 상태 변경 반영 지연을 제한하기 위해 필요 |
| `ObjectStorageService` | 인증된 MinIO 버킷 접근 확인 | 포트만 열린 상태가 아니라 이미지 저장 권한까지 준비됐는지 판별하기 위해 필요 |
| `AuthService` | 회원가입, 비밀번호 검증, 로그인 실패·잠금 처리 | 인증 정책을 컨트롤러와 저장소 코드에서 분리해 일관되게 적용하기 위해 필요 |
| `SessionService` | 세션 생성·조회·유휴 연장·폐기 | 서버가 세션을 즉시 무효화하고 절대·유휴 만료를 통제하기 위해 필요 |
| 인증 Guard | 쿠키, Origin, JSON, CSRF 검증 | 비즈니스 로직에 도달하기 전에 위조·교차 사이트 요청을 차단하기 위해 필요 |
| 감사 로그 | 가입·로그인 성공·실패·로그아웃 기록 | 보안 사고 분석과 관리자 추적을 위한 근거를 남기기 위해 필요 |

## API 경로

| 메서드·경로 | 역할 | 주요 조건 |
|---|---|---|
| `POST /api/v1/auth/register` | 일반 사용자 가입 | JSON, 비밀번호 12~128자, 신뢰 Origin |
| `POST /api/v1/auth/verify-email` | 일회용 토큰 소비 및 계정 활성화 | JSON, 신뢰 Origin, 미사용·미만료 토큰 |
| `POST /api/v1/auth/login` | 세션 쿠키와 CSRF 토큰 발급 | `ACTIVE` 계정, 올바른 비밀번호 |
| `GET /api/v1/auth/me` | 현재 로그인 사용자 확인 | 유효한 세션 쿠키 |
| `GET /api/v1/auth/csrf` | 현재 세션의 CSRF 토큰 교체 | 유효한 세션 쿠키 |
| `POST /api/v1/auth/logout` | 현재 세션 폐기 | JSON, 세션 쿠키, 신뢰 Origin, `X-CSRF-Token` |

가입 응답에 비밀번호 해시나 인증 토큰은 포함하지 않는다. 로그인 응답에는 동기화 CSRF 토큰을 한 번 전달하며 세션 식별자는 HttpOnly 쿠키로만 전달한다. 인증 관련 응답은 `Cache-Control: no-store`로 브라우저·중간 캐시에 남지 않게 한다.

## 비밀번호와 계정 보호

- Argon2id: 메모리 64 MiB, 반복 3회, 병렬도 1
- 최소 12자, 최대 128자
- 존재하지 않는 계정도 더미 Argon2id 해시를 검증해 계정 존재 여부에 따른 시간 차이를 줄임
- 로그인 실패 응답은 항상 `Invalid email or password`로 통일
- 계정별 5회 실패 시 15분 잠금
- 로그인 성공 시 실패 횟수와 잠금을 초기화
- 신규 계정은 `PENDING_VERIFICATION`; 일회용 이메일 확인 토큰을 소비하면 `ACTIVE`로 전환

## 세션 보안

- 세션·CSRF 토큰은 각각 256비트 무작위 값으로 생성한다.
- PostgreSQL과 Redis에는 원문 대신 SHA-256 해시만 저장한다.
- 일반 계정은 유휴 30분·절대 12시간, 관리자는 유휴 15분·절대 8시간이다.
- 마지막 사용 시각 DB 쓰기는 5분 간격으로 제한한다.
- Redis 캐시는 최대 60초이며 장애 시 PostgreSQL을 기준으로 조회한다.
- 로컬 쿠키는 `re.sid`, 운영 쿠키는 `__Host-re.sid`를 사용한다.
- 쿠키는 HttpOnly, SameSite=Lax, Path=/를 사용하고 운영에서는 Secure를 강제한다.
- IP와 User-Agent는 원문 대신 `AUTH_HASH_SECRET`을 이용한 HMAC으로 저장한다.

## 강화된 readiness

`GET /api/v1/health/ready`는 다음 실제 작업을 수행한다.

- PostgreSQL: `SELECT 1`
- Redis: 비밀번호가 적용된 `PING`
- MinIO: 자격 증명을 사용한 `HeadBucket`

따라서 네트워크 포트만 열려 있고 비밀번호나 버킷 권한이 잘못된 상태를 정상으로 오판하지 않는다.

## 빌드와 배포 구조

`@real-estate/db`는 ESM JavaScript와 선언 파일을 별도로 빌드한다. API Docker 이미지는 DB 패키지의 빌드 결과와 API 운영 의존성만 복사하며 Prisma CLI는 포함하지 않는다. 실행 사용자는 UID 1001의 비루트 사용자다.

Prisma 7의 `prisma-client` 생성기가 만든 TypeScript를 Node.js ESM에서 실행할 수 있도록 import 확장자를 `.js`로 생성한다.

## 검증 결과

- 포맷·린트·타입 검사 성공
- 기존 단위 테스트 1건 성공
- 의존성 없는 API E2E 테스트 6건 성공
- 실제 PostgreSQL·Redis·MinIO 통합 인증 테스트 1건 성공
- Docker에서 회원가입 → 가입 전 로그인 거부 → 테스트 계정 활성화 → 로그인 → `/auth/me` → 잘못된 CSRF 로그아웃 거부 → 정상 로그아웃 → 세션 재사용 거부 흐름 성공
- 로그아웃 세션의 `revoked_at` 기록 확인
- 테스트 계정·세션·감사 기록 정리 확인
- 전체 웹·API 프로덕션 빌드 성공
- 전체 Docker 컨테이너 healthy

통합 테스트 실행:

```powershell
npm.cmd run docker:infra
npm.cmd run test:integration
```

## 남은 작업

- 운영 이메일 발송 어댑터와 재전송·빈도 제한
- 분산 환경에서 계정 잠금 카운터를 완전히 원자화하는 정책 검토
- 비밀번호 유출 목록 확인
- 매물·문의 등 리소스별 소유권 검사
- 관리자 MFA
- 비밀번호 변경 시 전체 세션 폐기

이번 작업은 데이터베이스 스키마를 변경하지 않았다. 롤백 시 인증 모듈과 클라이언트 연결 코드를 이전 버전으로 복원하며 기존 사용자·세션 데이터는 임의로 삭제하지 않는다.

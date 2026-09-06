---
title: Docker 설치 및 전체 스택 검증
created_at: "2026-09-04 02:28:19 KST"
updated_at: "2026-09-04 02:28:19 KST"
status: 완료
document_type: implementation-record
---

# Docker 설치 및 전체 스택 검증

## 설치 결과

- Docker Desktop 4.89.0
- Docker CLI·Engine 29.7.2
- Docker Compose 5.5.0
- Linux 컨테이너 실행 기반: WSL 2

Docker Desktop은 Windows에서 Linux 컨테이너를 만들고 실행하는 엔진과 관리 환경을 제공한다. 개발자마다 PostgreSQL·Redis 같은 프로그램을 서로 다른 방식으로 직접 설치하는 대신, 프로젝트에 기록된 동일한 이미지와 설정으로 실행하기 위해 필요하다.

## 구성 요소의 역할과 필요한 이유

| 구성 요소 | 역할 | 필요한 이유 |
|---|---|---|
| Docker Compose | 여러 컨테이너의 설정과 기동 순서를 한 파일로 관리 | 새 개발 환경과 장애 복구 환경을 같은 명령으로 재현하기 위해 필요 |
| PostgreSQL 18 | 계정, 매물, 문의, 신고, 감사 이력의 영구 저장소 | 관계와 트랜잭션이 중요한 핵심 데이터를 일관되게 보존하기 위해 필요 |
| Redis 8 | 세션·요청 제한 등에 사용할 빠른 임시 저장소 | 매 요청마다 PostgreSQL에 집중되는 부하를 줄이고 만료 기반 데이터를 빠르게 처리하기 위해 필요 |
| MinIO | 로컬 S3 호환 객체 저장소 | 매물 이미지 기능을 AWS S3와 유사한 API로 로컬에서 개발·검증하기 위해 필요 |
| API 컨테이너 | NestJS 비즈니스 API 실행 | 브라우저 요청을 검증하고 데이터 저장소에 연결하는 서버 계층 |
| 웹 컨테이너 | Next.js 사용자 화면 실행 | 사용자에게 매물 검색·등록·문의 화면을 제공하는 프런트엔드 계층 |
| 명명된 볼륨 | 컨테이너 밖에 DB·Redis·MinIO 데이터를 유지 | 컨테이너를 교체하거나 재빌드해도 개발 데이터가 사라지지 않게 하기 위해 필요 |

## 보안과 연결 구성

- 모든 호스트 포트는 `127.0.0.1`에만 게시하여 다른 PC에서 직접 접근할 수 없게 했다.
- Redis에 비밀번호 인증을 적용했고, 인증 없는 `PING`이 `NOAUTH`로 거부되는 것을 확인했다.
- MinIO 초기화 컨테이너가 `real-estate-listings` 버킷을 만들고 익명 접근을 차단한다.
- 웹과 API 컨테이너는 권한이 제한된 비루트 사용자로 실행한다.
- `.env`는 Git에서 제외한다. 예시 비밀번호는 로컬 전용이며 스테이징·운영에서 재사용하지 않는다.
- API 운영 이미지에는 개발 도구를 제외한 운영 의존성과 빌드된 DB 패키지만 설치하며 Prisma CLI는 포함하지 않는다. 저장소 감사의 남은 4건은 Prisma CLI 잠금 파일의 전이 의존성이므로 수정 릴리스를 추적한다.

## 해결한 호환성 문제

1. PostgreSQL 18 공식 이미지의 데이터 디렉터리 변경에 맞춰 볼륨 대상을 `/var/lib/postgresql`로 수정했다. 이전 경로를 사용하면 새 버전에서 데이터가 의도대로 유지되지 않을 수 있다.
2. `backend` 네트워크의 완전 격리 설정이 로컬 호스트 접속도 막고 있어 일반 브리지로 바꾸고, 포트는 루프백 주소에만 제한했다.
3. Redis에 `requirepass`를 적용하고 API의 Redis URL에도 인증 정보를 연결했다.
4. 한글 작업 경로에서 Docker BuildKit 세션이 실패하는 알려진 문제를 피하도록 `scripts/docker-dev.ps1`가 임시 영문 Junction을 자동 생성한다. 원본 소스를 복사하거나 이동하지 않는다.
5. API 운영 의존성 단계가 내부 워크스페이스 패키지를 npm 공개 저장소에서 찾던 문제를 잠금 파일 기반의 workspace 설치로 수정했다.
6. 웹 Docker 빌드에 누락됐던 공통 TypeScript 설정을 포함했다.

## 데이터베이스 적용 결과

`npm.cmd run db:deploy`로 `20260904022000_init` 마이그레이션을 적용했다.

- 핵심 업무 테이블: 17개
- Prisma 마이그레이션 이력 테이블: 1개
- PostgreSQL CHECK 제약조건: 9개
- `prisma migrate status`: 최신 상태

마이그레이션은 데이터베이스 구조의 버전 기록이다. 개발·스테이징·운영에서 같은 테이블과 제약조건을 같은 순서로 만들고, 어떤 변경이 적용됐는지 추적하기 위해 필요하다.

## 실행과 확인

```powershell
npm.cmd run docker:infra
npm.cmd run db:deploy
npm.cmd run docker:up
npm.cmd run docker:ps
```

- `docker:infra`: PostgreSQL·Redis·MinIO만 기동
- `docker:up`: API와 웹 이미지를 빌드하고 전체 스택 기동
- `docker:ps`: 모든 컨테이너의 현재 상태 확인
- `docker:down`: 컨테이너와 네트워크만 내리고 데이터 볼륨은 보존

검증 결과:

- PostgreSQL, Redis, MinIO, API, 웹 컨테이너 모두 healthy
- MinIO 버킷 초기화 컨테이너 정상 종료 코드 0
- `GET http://localhost:4000/api/v1/health/live`: HTTP 200
- `GET http://localhost:4000/api/v1/health/ready`: HTTP 200, 세 의존성 모두 up
- `GET http://localhost:3000/api/health`: HTTP 200
- `GET http://localhost:3000/`: HTTP 200, HTML 응답

## 복구와 주의 사항

- 컨테이너 장애 시 `npm.cmd run docker:down` 후 `npm.cmd run docker:up`으로 재생성할 수 있다.
- 위 명령은 명명된 데이터 볼륨을 보존한다.
- `docker compose down --volumes`는 데이터베이스와 저장 파일을 삭제하므로, 명시적으로 데이터를 폐기할 때만 사용한다.
- Docker Desktop이 꺼져 있으면 먼저 실행한 뒤 명령을 사용한다.

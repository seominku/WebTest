# Real Estate Platform

[웹사이트 접속하기 · 임시 테스트 사이트](https://packages-sticks-limiting-website.trycloudflare.com/listings)

> 별도로 전달받은 접속 암호가 필요합니다. 가상 데이터 테스트용이며 **2026년 9월 6일 22:13:49 KST 자동 종료 예정**입니다. 호스트 컴퓨터·Docker·터널이 꺼지면 더 일찍 접속이 중단될 수 있습니다. 영구 운영 주소가 아니며, 재실행 시 주소가 변경될 수 있습니다.

부동산 매물 서비스의 개발·보안·장애 대응·유지보수 과정을 연습하기 위한 모노레포입니다. `real-estate-platform`은 브랜드명이 정해질 때까지 사용하는 내부 작업명입니다.

GitHub 공개 저장소: [seominku/WebTest](https://github.com/seominku/WebTest). 소스와 개발 문서를 공유하는 저장소이며, GitHub 푸시 자체가 실제 웹사이트의 운영 배포를 의미하지 않습니다. 실제 환경 설정·비밀번호·백업·임시 실행 데이터는 포함하지 않습니다.

## 구성

- `apps/web`: Next.js App Router 웹 앱
- `apps/api`: NestJS API 서버
- `packages/db`: Prisma 스키마와 PostgreSQL 클라이언트
- `packages/shared`: 앱 간에 공유하는 계약과 타입
- `packages/config`: 공통 TypeScript 설정
- `infrastructure`: 컨테이너 설정
- `md`: 의사결정, 운영 가이드, 작업 기록

주요 설계 문서:

- [서버 측 불투명 세션 인증](./md/ADR-001_세션인증방식.md)
- [핵심 데이터 모델](./md/05_핵심_데이터모델.md)
- [Docker 설치 및 전체 스택 검증](./md/06_Docker_설치_및_전체스택_검증.md)
- [API 저장소 연결 및 서버 측 세션 인증](./md/07_API_저장소연결_및_세션인증.md)
- [이메일 확인·역할 검사·웹 인증 화면](./md/08_이메일확인_권한검사_웹인증화면.md)
- [Redis 인증 요청 제한과 프록시 신뢰](./md/09_Redis_인증요청제한_및_프록시신뢰.md)
- [공개 매물 목록·상세 조회](./md/10_공개매물_목록상세조회.md)
- [중개사 매물 등록·수정 및 소유권 보호](./md/11_중개사_매물등록수정_및_소유권보호.md)
- [매물 검수 상태 전이 및 관리자 화면](./md/12_매물검수_상태전이_및_관리자화면.md)
- [매물 게시 수명주기 및 자동 만료](./md/13_매물게시_수명주기_및_자동만료.md)
- [MinIO 매물 이미지 업로드 및 안전 처리](./md/14_MinIO_매물이미지_업로드_및_안전처리.md)
- [ClamAV 비동기 이미지 검사 및 썸네일](./md/15_ClamAV_비동기이미지검사_및_썸네일.md)
- [로컬 운영 상태 자동 점검](./md/20_로컬_운영상태_자동점검.md)
- [격리 HTTP 장애 감지·복구 훈련](./md/21_격리_HTTP_장애감지_복구훈련.md)
- [실제 모니터링 격리 훈련 구성](./md/22_실제_모니터링_격리훈련_구성.md)
- [운영 공개 전 남은 조건](./md/23_운영공개_전_남은조건.md)
- [DB·사진 복구 사전 점검](./md/24_DB_사진_복구_사전점검.md)
- [DB·사진 통합 백업·격리 복원 검증](./md/25_DB_사진_통합백업_격리복원_검증.md)
- [원본 없이 기존 백업 복원 검증](./md/26_원본없이_기존백업_복원검증.md)
- [백업 권한·암호화·보관 정책](./md/27_백업_접근권한_암호화_보관정책.md)
- [실제 앱 인프라 장애·복구 격리 훈련](./md/28_실제_앱_인프라_장애복구_훈련.md)
- [API 로컬 서버 적용·복구 절차](./md/29_API_로컬서버_안전배포_및_검증.md)
- [암호 보호 임시 외부 접속](./md/30_암호보호_임시_외부접속.md)

## 시작하기

가상 데이터만 있는 암호 보호 외부 테스트 환경은 `npm.cmd run preview:start`로 실행하고 `npm.cmd run preview:stop`으로 종료합니다. 전용 웹 이미지가 먼저 필요하며 원본 Compose를 공개하지 않습니다. HTTPS/사진 업로드 검증은 `npm.cmd run preview:verify`, 안전 함수 테스트는 `npm.cmd run test:preview`입니다. 주소·만료 시각은 `.artifacts/preview-status.json`, 암호는 실행별 소유자 전용 `access.txt`에만 저장합니다. 4시간 제한·재실행·보존 볼륨·실기기 점검 범위는 30번 문서를 참고하세요.

Windows의 백업 보호 상태는 `npm.cmd run backup:security`로 읽기 전용 점검합니다. 평문 형식 파일이나 추가 ACL 허용 규칙 등이 있으면 `needs_attention`을 반환하며, 권한 변경·암호화·삭제는 하지 않습니다. 현재 자동 삭제는 없고 실제 암호화 키 방식은 사용자 선택을 기다리는 상태입니다. 자세한 범위는 27번 문서를 참고하세요.

실제 DB·Redis·사진 저장소·검사기 중단 후 API 복구는 `npm.cmd run drill:app`으로 격리 검증합니다. 임시 데이터와 내부 Docker 네트워크만 사용하고, 원본 대신 이번 실행이 만든 자원만 중단·시작·정리합니다. ClamAV는 실제 프로그램과 훈련용 정의 파일을 사용하며 악성코드 탐지 성능 검증은 아닙니다. 실행 조건·수정 사항·검증 한계는 28번 문서를 참고하세요. 이 명령은 기존 사이트에 코드를 재배포하지 않습니다.

로컬 API만 교체할 때는 `npm.cmd run deploy:api:check`로 먼저 확인하고 `npm.cmd run deploy:api:local`을 실행합니다. 복구 이미지를 보존한 뒤 API만 빌드·교체하고 임시 데이터로 로그인·사진 업로드를 검사합니다. API의 짧은 중단과 테스트 데이터 생성·정리가 있는 명령입니다. 28번 수정은 기존 로컬 서버 적용까지 완료했으며 상세 결과와 복구 명령은 29번 문서에 기록했습니다.

보관된 백업만 검증하려면 `npm.cmd run recovery:restore -- backups/recovery-실행ID`를 사용합니다. 원본 `.env`·DB·사진 저장소 연결 없이 별도 임시 환경에 복원하고, 기존 백업을 보존한 채 새 결과를 `.artifacts/recovery-restore-새실행ID/`에 기록합니다. Docker와 검증용 이미지 등 실행 전제는 26번 문서를 참고하세요.

DB·사진 백업 준비 상태는 `npm.cmd run recovery:preflight`로 확인합니다. 로컬 DB를 읽기 전용으로 조회하고 READY 사진 본문·썸네일의 저장소 메타데이터를 비교합니다. 백업 생성·사진 내용 검사·복원을 수행하는 명령은 아닙니다. 도구 테스트는 `npm.cmd run test:recovery:preflight`입니다.

`npm.cmd run recovery:verify`는 동일 DB 스냅샷의 덤프·사진 목록과 READY 사진 복사본을 `backups/recovery-실행ID/`에 보관한 뒤, 별도 임시 PostgreSQL·MinIO에서 내용 해시·사진 디코딩·누락/손상 감지를 검증합니다. 기존 서버를 중단하지 않으며 임시 자원만 정리합니다. 백업은 계정 정보·사진을 포함할 수 있는 비암호화 민감 파일이므로 외부 공유하지 마세요. 이미지 전제와 범위는 25번 문서를 참고하며 테스트는 `npm.cmd run test:recovery`입니다.

필수 도구는 Node.js 24 LTS, npm 11.19.1, Docker Desktop입니다. npm 11.19.1은 workspace를 거치는 보안 버전 규칙(`overrides`)을 올바르게 처리하는 검증 버전이며 Docker 빌드에도 동일하게 적용합니다. `.npmrc`의 `engine-strict`가 지원 범위 밖 npm의 설치를 막습니다.

```powershell
Copy-Item .env.example .env
npm.cmd install --global npm@11.19.1
npm.cmd ci
npm.cmd run deps:check
npm.cmd run docker:infra
npm.cmd run db:generate
npm.cmd run db:deploy
npm.cmd run db:seed
npm.cmd run docker:up
```

스테이징·운영에서는 대화형 개발 마이그레이션 대신 `npm.cmd run db:deploy`를 사용합니다.
현재 Windows 작업 경로에 한글이 포함되어 있어 Docker BuildKit 호환용 영문 경로 별칭을 실행 도우미가 자동으로 만듭니다. 컨테이너만 내릴 때는 `npm.cmd run docker:down`을 사용하며, 데이터 볼륨은 삭제하지 않습니다.

- 웹: <http://localhost:3000>
- 회원가입: <http://localhost:3000/register>
- 로그인: <http://localhost:3000/login>
- 내 계정: <http://localhost:3000/account>
- 공개 매물: <http://localhost:3000/listings>
- 관심 매물: <http://localhost:3000/favorites>
- 관심 매물 비교: <http://localhost:3000/compare> (`/favorites`에서 2~3개 선택)
- 최근 본 매물: <http://localhost:3000/recent>
- 문의 관리: <http://localhost:3000/inquiries>
- 저장 검색·새 매물 알림: <http://localhost:3000/saved-searches>
- 방문 일정: <http://localhost:3000/viewings>
- 중개사 매물 관리: <http://localhost:3000/agent/listings>
- 관리자 매물 검수: <http://localhost:3000/admin/listings>
- API liveness: <http://localhost:4000/api/v1/health/live>
- API readiness: <http://localhost:4000/api/v1/health/ready>
- 관리자 이미지 정리 메트릭: <http://localhost:4000/api/v1/health/metrics>
- Prometheus 수집 메트릭: <http://localhost:4000/api/v1/health/metrics/prometheus> (`Authorization: Bearer $METRICS_TOKEN` 필요)
- Prometheus 모니터링 화면: <http://localhost:9090> (로컬 PC에서만 접근 가능)
- Alertmanager 경보 관리 화면: <http://localhost:9093> (현재 로컬 확인 전용이며 외부 알림 전송 없음)
- MinIO 콘솔: <http://localhost:9001>

로컬 서버를 켠 뒤 `npm.cmd run ops:check`로 웹·API·저장소 연결·사진 검사 서버·지표 수집·경보 규칙을 한 번에 확인할 수 있습니다. 모든 항목이 통과하면 `status: "ok"`, 하나라도 실패하면 `needs_attention`과 종료 코드 1을 반환합니다. 현재 PC에 읽기 요청만 보내며 계정·매물 데이터를 변경하지 않습니다. 점검 도구 자체의 회귀 테스트는 `npm.cmd run test:operations`입니다. 이 점검은 실제 브라우저 기능 테스트나 외부 배포 승인을 대신하지 않습니다.

`npm.cmd run test:operations:drill`은 별도 임시 포트의 모의 HTTP 서버로 장애 감지와 복구 판정을 검증합니다. 연결 중단·응답 시간 초과·경보 발생 등을 재현한 뒤 정상 판정으로 돌아오는지 확인하며, 현재 Docker 서버나 실제 데이터를 건드리지 않습니다. 실제 DB 복원이나 Prometheus 경보 전달 훈련과는 구분됩니다.

실제 Prometheus·Alertmanager 경보 훈련용 독립 구성은 `infrastructure/drill/compose.yml`에 있습니다. `npm.cmd run drill:config`와 `npm.cmd run test:drill:config`는 컨테이너 실행 없이 격리 설정을 검사합니다. 가상 지표 서버 중단에 대한 실제 경보 발생·수신·해제를 검증했고 훈련 자원은 정리했습니다. 반복 실행 시에는 위 22번 문서의 고정 프로젝트 범위와 컨테이너 내부 조회 절차를 따릅니다. 루트 Compose는 로컬 개발용이므로 그대로 외부 공개하지 않습니다.

공개 매물 목록의 거래 유형 필터 아래에는 Leaflet과 OpenStreetMap 타일로 구성한 실제 지도가 표시됩니다. 공개용 근사 좌표에 매물 마커를 표시하며, 마커를 클릭하면 해당 매물 상세 화면으로 이동합니다. 지도 라이브러리와 타일은 외부 CDN/인터넷 연결이 필요합니다.

공개 매물은 최신순, 가격 낮은·높은순, 전용면적 작은·큰순으로 정렬할 수 있습니다. 가격의 의미가 다른 매매·전세·월세를 잘못 비교하지 않도록 가격순은 거래 유형을 함께 선택해야 합니다.

매물 상세의 `매물 정보 > 전용 면적`에서 `㎡` 또는 `평`을 선택하면 매물 목록·지도·상세·관심 매물 비교·저장 검색 설명에 같은 단위가 적용됩니다. 평 단위 검색값은 `1평 = 3.305785㎡` 기준으로 ㎡로 자동 변환하며, 정확한 원본과 API·데이터베이스 값은 ㎡로 유지합니다. 선택값은 현재 브라우저에만 저장되어 새로고침 뒤에도 유지되며 서버나 외부 서비스로 전송하지 않습니다.

로그인 사용자는 현재 지역·가격·면적·매물 유형·거래 유형 조건을 계정에 최대 20개까지 저장할 수 있습니다. 저장 후 조건과 일치하는 매물이 새로 게시되면 `/saved-searches`와 상단 숫자 배지에서 확인할 수 있으며, 이 알림은 이메일·문자 같은 외부 서비스로 전송하지 않습니다. 알림 목록은 페이지로 나뉘고 사용자가 `모두 읽음`을 눌러야 읽음 처리됩니다. 읽은 저장 검색 알림만 180일 뒤 정리하며 읽지 않은 알림과 문의 기록은 자동 삭제하지 않습니다.

매물 상세에서 1시간 이후부터 90일 이내의 방문 희망 시간을 요청할 수 있습니다. 담당 중개사는 `/viewings`에서 요청을 확정하거나 거절하고 안내를 남길 수 있으며, 사용자는 대기·확정된 미래 일정을 취소할 수 있습니다.

고정 샘플 매물에는 외부 이미지 서버에 의존하지 않는 로컬 WebP 사진 3장이 표시됩니다. 사진은 AI로 생성한 가상 연출 이미지이며 실제 매물 사진으로 오인하지 않도록 카드와 슬라이더에 `샘플 이미지`를 표시합니다. 실제 중개사가 업로드한 검증 완료 사진이 있으면 샘플 대신 실제 사진을 우선 사용합니다.

매물 상세를 열면 최근 본 매물이 현재 브라우저의 로컬 저장소에 최대 20개까지 최신순으로 보관됩니다. 이 기록은 계정이나 서버로 전송되지 않으며 `/recent`에서 개별 또는 전체 삭제할 수 있습니다.

로그인 사용자는 `/favorites`에서 관심 매물을 2~3개 선택해 가격·전용면적·위치·중개사 정보와 지도 마커를 `/compare`에서 나란히 비교할 수 있습니다. URL의 매물 ID는 현재 사용자의 관심 목록과 다시 대조합니다.

주소 자동 좌표 변환 경로는 구현되어 있지만 외부 주소 전송 동의를 받기 전까지 기본 비활성화되어 있습니다. 승인된 지오코딩 공급자 또는 자체 서버의 `GEOCODING_BASE_URL`과 명시적 승인값 `GEOCODING_DATA_SHARING_APPROVED=true`가 모두 있어야 활성화됩니다. URL만 입력한 상태에서는 주소를 전송하지 않습니다.

Prometheus 경보는 로컬 Alertmanager로 전달되어 경보 묶음과 해제 상태를 확인할 수 있습니다. 이메일·Slack 같은 외부 수신 채널은 주소와 전송 동의가 필요하므로 기본 설정에는 포함하지 않습니다.

인증 API:

- `POST /api/v1/auth/register`: 회원가입
- `POST /api/v1/auth/verify-email`: 일회용 토큰으로 이메일 확인
- `POST /api/v1/auth/login`: 로그인 및 세션 발급
- `GET /api/v1/auth/me`: 현재 사용자 확인
- `GET /api/v1/auth/csrf`: 현재 세션의 CSRF 토큰 교체
- `POST /api/v1/auth/logout`: CSRF 검증 후 로그아웃

공개 매물 API:

- `GET /api/v1/listings`: 게시 중인 매물 목록과 거래 유형·매물 유형·지역 필터
- `GET /api/v1/listings/:id`: 게시 중인 매물 상세
- `GET /api/v1/listings/:id/images/:imageId/content`: 게시 중인 매물 이미지
- `GET /api/v1/listings/:id/images/:imageId/thumbnail`: 게시 중인 매물 목록용 썸네일
- `GET /api/v1/listings/favorites`: 로그인 사용자의 관심 매물
- `POST|DELETE /api/v1/listings/:id/favorite`: 관심 매물 저장·해제

문의 API:

- `POST /api/v1/inquiries`: 공개 매물에 문의 작성
- `GET /api/v1/inquiries/mine?page=1&pageSize=10`: 내가 보낸 문의와 답변 상태
- `GET /api/v1/inquiries/received?page=1&pageSize=10`: 중개사가 자기 매물에 받은 문의 조회
- `PUT /api/v1/inquiries/:id/respond`: 해당 매물 중개사의 답변 등록·수정
- `POST /api/v1/inquiries/:id/close`: 문의자 또는 해당 중개사의 문의 종료

저장 검색 API:

- `GET|POST /api/v1/saved-searches`: 내 저장 조건 조회·생성
- `DELETE /api/v1/saved-searches/:id`: 내 저장 조건 삭제
- `GET /api/v1/saved-searches/matches?page=1&pageSize=10`: 저장 이후 게시된 일치 매물 조회
- `GET /api/v1/saved-searches/unread-count`: 읽지 않은 일치 매물 개수
- `POST /api/v1/saved-searches/matches/viewed`: 일치 매물 알림 읽음 처리

방문 일정 API:

- `POST /api/v1/viewings`: 공개 매물 방문 희망 시간 요청
- `GET /api/v1/viewings/mine`: 내가 요청한 방문 일정 조회
- `GET /api/v1/viewings/received`: 담당 중개사가 받은 방문 요청 조회
- `PUT /api/v1/viewings/:id/respond`: 담당 중개사의 확정·거절
- `POST /api/v1/viewings/:id/reschedule-proposals`: 고객 또는 담당 중개사의 새 방문 시간 제안
- `PUT /api/v1/viewings/:id/reschedule-proposals/respond`: 상대방의 시간 변경 수락·거절
- `POST /api/v1/viewings/:id/cancel`: 요청자의 미래 일정 취소

중개사 매물 관리 API:

- `GET /api/v1/listings/mine`: 내 매물 목록
- `GET /api/v1/listings/mine/:id`: 내 매물 편집 정보
- `POST /api/v1/listings/mine/:id/images`: 이미지 격리 업로드와 비동기 악성코드 검사 대기
- `PUT /api/v1/listings/mine/:id/images/order`: 이미지 순서와 대표 이미지 변경
- `DELETE /api/v1/listings/mine/:id/images/:imageId`: 이미지 삭제
- `GET /api/v1/listings/mine/:id/images/:imageId/content`: 소유 중개사용 이미지 미리보기
- `GET /api/v1/listings/mine/:id/images/:imageId/thumbnail`: 소유 중개사용 목록 썸네일
- `POST /api/v1/listings`: 검수 전 초안 등록
- `PUT /api/v1/listings/:id`: 소유권과 버전을 확인한 초안 수정
- `POST /api/v1/listings/:id/submit-review`: 중개사 검수 요청
- `GET /api/v1/listings/review-queue`: 관리자 검수 대기열
- `POST /api/v1/listings/:id/review`: 관리자 승인·수정 요구·반려
- `GET /api/v1/listings/publication-queue`: 관리자 게시 대기열
- `POST /api/v1/listings/:id/publish`: 승인 매물 게시 시작
- `POST /api/v1/listings/:id/pause`: 소유 중개사 게시 중지
- `POST /api/v1/listings/:id/resume`: 소유 중개사 게시 재개
- `POST /api/v1/listings/:id/complete`: 소유 중개사 거래 완료

실제 저장소를 사용하는 인증 통합 테스트는 인프라 컨테이너를 실행한 뒤 `npm.cmd run test:integration`으로 실행합니다.
실행 중인 Docker API를 끝까지 호출하는 인증 스모크 테스트는 `npm.cmd run test:smoke:auth`로 실행합니다. 이 테스트가 만든 계정·세션·감사 기록은 종료 시 정리됩니다.
가상 매물 시드와 공개 조건은 `npm.cmd run db:seed`와 `npm.cmd run test:smoke:listings`로 반복 검증할 수 있습니다. 시드는 `local`·`test` 환경에서만 실행됩니다.
실행 중인 Docker API의 중개사 매물 생성·수정·충돌·이력 흐름은 `npm.cmd run test:smoke:listings:manage`로 검증하며 테스트 데이터는 종료 시 자동 정리됩니다.
저장 검색과 방문 일정의 사용자·중개사 역할 전체 흐름은 `npm.cmd run test:smoke:user-flows`로 검증하며 생성한 검색·일정·세션·감사 기록은 종료 시 자동 정리됩니다.
목록과 상세 화면의 모바일 390px·태블릿 768px·데스크톱 1440px 가로 넘침은 `npm.cmd run test:responsive`로 검사합니다. 결과 이미지와 JSON 보고서는 로컬 `.artifacts/responsive`에 생성되며 Git과 Docker 빌드에는 포함되지 않습니다.
실제 데이터베이스 백업 생성과 격리된 임시 데이터베이스 복원 검증은 `npm.cmd run db:backup:verify`로 실행합니다. 백업 파일은 로컬 `backups`에 남고 Git과 Docker 빌드에는 포함되지 않으며, 현재 운영 데이터베이스를 덮어쓰지 않습니다.
외부 연결 준비 상태는 `npm.cmd run test:external-readiness`로 확인합니다. 이 명령은 설정만 읽고 네트워크 요청을 하지 않으며 주소 지오코딩 승인과 Alertmanager 외부 수신처 여부를 값 없이 요약합니다. 승인 절차는 `md/16_외부서비스_연결_준비_체크리스트.md`를 따릅니다.
npm 의존성 보안 권고는 `npm.cmd run security:audit`로 확인합니다. 이 명령은 패키지 이름과 버전 정보를 npm 보안 권고 서버에 보내 최신 취약점과 비교하며 고객·매물·주소 데이터는 전송하지 않습니다. Prisma 7.10.0이 고정한 취약 간접 패키지는 루트 `overrides`로 수정 버전을 사용하고 있으며, 유지·제거 기준은 `md/17_의존성_보안_관리.md`에 기록합니다.

가입·이메일 확인·로그인 API에는 Redis 기반 요청 제한이 적용됩니다. 운영에서 로드 밸런서나 리버스 프록시를 사용할 때는 실제 네트워크 경로와 일치하도록 `TRUST_PROXY_HOPS`를 반드시 명시해야 하며, 직접 접속하는 로컬 환경은 `0`을 사용합니다.

실제 비밀번호, 토큰, API 키는 저장소에 커밋하지 않습니다. `.env.example` 값은 로컬 개발 예시이며 스테이징·운영에서 재사용하면 안 됩니다.

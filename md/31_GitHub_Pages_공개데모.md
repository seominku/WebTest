---
title: GitHub Pages 읽기 전용 공개 데모
created_at: "2026-09-06 19:53:21 KST"
updated_at: "2026-09-06 19:53:21 KST"
status: 배포 준비 및 검증 중
document_type: deployment-guide
---

# GitHub Pages 공개 데모

- 요청: 임시 터널 종료 시간과 PC 실행 상태에 의존하지 않는 GitHub 웹사이트 주소.
- 주소: https://seominku.github.io/WebTest/ (배포 성공 여부는 아래 검증 기록 참고)
- 방식: `demo/github-pages`의 독립 HTML/CSS/JS를 GitHub Actions로 빌드하여 Pages에 게시. 기존 Next.js/NestJS 앱과 DB는 수정하지 않는다.
- 범위: 공개 가상 매물 3개, 실제 지형 지도와 가상 좌표, 동일 좌표/인접 매물 묶음, 옆 상세 패널, AI 샘플 사진 3장, 전용면적 ㎡/평 선택, 모바일 세로 배치.
- 제외: 로그인·매물 등록/수정·업로드·문의·실시간 DB·주변 시설 조회. 전체 앱의 기능/운영 공개 완료를 의미하지 않는다.
- 이유: GitHub Pages는 정적 파일 호스팅이며 현재 앱의 서버 및 데이터베이스를 실행하지 못한다. 만료되는 API 터널에 의존하지 않도록 읽기 전용 데모를 분리한다.

## 보안 및 운영

- `scripts/build-pages-demo.mjs`가 지정한 웹 파일 4개와 기존 공개 AI 사진 3개만 게시한다. 저장소 전체, `.env`, 백업, 로그, 실제 DB, 계정 정보는 배포 산출물에서 제외한다.
- API 호출 및 폼 전송 없음. CSP의 `connect-src 'none'`, `form-action 'none'` 적용. 검색 노출 억제용 noindex는 접근 제어가 아니며 모든 데모 파일은 공개된다.
- 기존 앱의 로그인/권한 검사는 변경하지 않는다. 기존 로컬 서버 및 임시 테스트 컨테이너는 재시작/삭제하지 않는다.
- 지도 라이브러리는 Leaflet 1.9.4를 SRI로 검증하고, OpenStreetMap 표준 타일을 사용한다. 출처 링크를 표시하고 브라우저 기본 캐시와 Referrer를 유지한다. 위치 권한, 주소 검색, 시설 검색, 별도 분석 도구는 사용하지 않는다.
- 지도/CDN 요청에는 IP·브라우저 등 일반 접속 정보가 해당 제공사에 전달된다. 이 내용을 데모 하단에 고지한다. 외부 지도 장애 시 매물 카드/사진은 계속 이용 가능하다.
- GitHub Actions는 공식 액션 커밋 SHA 고정, 빌드 `contents:read`, 배포 작업만 `pages:write`/`id-token:write`. 별도 배포 비밀키 없음.
- Pages가 유지되는 동안 PC를 꺼도 접속 가능하지만 GitHub/지도 제공사의 가용성까지 보장하는 것은 아니다.

## 재배포와 복구

1. `node --test scripts/pages-demo.test.mjs`
2. `node scripts/build-pages-demo.mjs`
3. 관련 소스를 `main`에 푸시하거나 `Deploy read-only GitHub Pages demo` 워크플로를 수동 실행한다.
4. Actions 성공 및 웹페이지/사진/지도 동작 확인.

롤백은 해당 데모 변경 커밋을 되돌려 다시 배포한다. 공개 중단이 필요하면 저장소 Settings → Pages에서 게시를 해제한다. 원본 앱이나 데이터의 삭제는 필요 없다.

## 검증 기록

- 2026-09-06 19:53:21 KST: 단위/정적 안전성 테스트 4/4, 앱 JS 구문 검사, 허용 목록 빌드(7개 파일) 통과. 실제 Pages 배포 및 브라우저 검증은 아직 대기.

## 참고

- [GitHub Pages 소개](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [공식 배포 워크플로](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Leaflet 시작 안내](https://leafletjs.com/examples/quick-start/)
- [OpenStreetMap 타일 정책](https://operations.osmfoundation.org/policies/tiles/)

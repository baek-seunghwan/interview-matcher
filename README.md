# PAIR · 카테부 실시간 모의면접 매칭

**닉네임 + 팀(예: 14팀) + 부서(AI / 풀스택 / 클라우드)**를 입력하고 **매칭 시작**을 누르면 같은 부서의 대기자와 즉시 1:1로 연결됩니다. 날짜·시간·장소 입력은 없습니다.

- [온라인 사이트](https://katebu-interview-matcher.vivid-knoll-0500.chatgpt.site)
- [기획서](docs/기획서.md)
- 앱 소스: `site/` (React + Vinext + Cloudflare Workers/D1)
- 서버 DB 원자적 매칭, 2초 상태 갱신, 취소·재매칭·완료 지원
- 브라우저 세션 방식이며 다른 브라우저/기기는 별도 사용자입니다.

## 로컬 실행

Node.js 22.13 이상.

```sh
cd site
npm ci
npm run build
```

새 로컬 DB에 다음 마이그레이션을 파일명 순으로 각각 한 번 적용합니다.

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_workable_iron_man.sql
```

`drizzle/0001_orange_onslaught.sql`도 같은 명령의 `--file`에 해당 파일명을 넣어 적용합니다. 이미 적용한 SQL은 재실행하지 않습니다.

```sh
npm run dev
npx tsc --noEmit
node tests/matching.mjs http://127.0.0.1:5173
```

테스트는 localhost에만 실행됩니다. 동시 사용자 10명, 부서 분리, 중복 배정 방지, 개인정보 분리, 재매칭, 완료, 잘못된 입력을 검증한 뒤 생성한 신청을 취소합니다.

## 주요 파일

- `site/app/page.tsx`: 한국어 반응형 화면
- `site/app/api/match/route.ts`: 신청·조회·취소·재매칭 API
- `site/db/matching.ts`: 원자적 매칭 처리
- `site/db/schema.ts`, `site/drizzle/`: 데이터 구조와 마이그레이션
- `site/.openai/hosting.json`: 배포 대상과 DB 연결

대기는 접속 확인이 90초 끊기면 만료되고 성사된 매칭은 최대 1시간 유지됩니다. 같은 장소에서 상대 팀과 닉네임을 확인하고 직접 만나는 서비스입니다. 서버는 요청 시 즉시 매칭하고 기존 대기자는 2초마다 결과를 확인합니다.

`@RTK.md`는 저장소와 상위 경로 및 검색 대상에서 발견되지 않아 별도 RTK 규칙은 적용하지 못했습니다.

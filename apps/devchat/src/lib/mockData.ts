import type { FileDiff, Project, Repository, Session } from "@devchat/types";

export const demoRepos: Repository[] = [
  {
    id: "repo_1",
    owner: "colna",
    name: "my-app",
    fullName: "colna/my-app",
    private: true,
    language: "TypeScript",
    stars: 12,
    defaultBranch: "main",
    updatedAt: "2026-05-10T08:00:00.000Z"
  },
  {
    id: "repo_2",
    owner: "colna",
    name: "api-server",
    fullName: "colna/api-server",
    private: true,
    language: "Rust",
    stars: 5,
    defaultBranch: "develop",
    updatedAt: "2026-05-09T12:00:00.000Z"
  },
  {
    id: "repo_3",
    owner: "colna",
    name: "blog",
    fullName: "colna/blog",
    private: false,
    language: "Next.js",
    stars: 3,
    defaultBranch: "main",
    updatedAt: "2026-05-07T09:30:00.000Z"
  }
];

export const demoProject: Project = {
  repoId: "repo_1",
  repoName: "my-app",
  branch: "main",
  lastAccessed: "2026-05-10T08:30:00.000Z",
  snapshot: {
    directoryTree: { src: ["App.tsx", "UserList.tsx"], package: "package.json" },
    techStack: {
      language: "TypeScript",
      framework: "React + Vite",
      dependencies: ["react", "vite", "zustand"]
    },
    keyFiles: [
      { path: "src/App.tsx", role: "root component", summary: "应用入口组件" },
      { path: "src/UserList.tsx", role: "feature component", summary: "用户列表展示" }
    ],
    moduleMap: { ui: ["src/App.tsx", "src/UserList.tsx"] },
    generatedAt: "2026-05-10T08:31:00.000Z"
  }
};

export const demoDiff: FileDiff = {
  filePath: "src/UserList.tsx",
  type: "modified",
  additions: 18,
  deletions: 3,
  selected: true,
  rawDiff: `--- a/src/UserList.tsx
+++ b/src/UserList.tsx
@@ -1,6 +1,12 @@
-import { users } from './data';
+import { useMemo, useState } from 'react';
+import { users } from './data';

 export function UserList() {
+  const [search, setSearch] = useState('');
+  const filteredUsers = useMemo(
+    () => users.filter((user) => user.name.includes(search)),
+    [search]
+  );
   return (
     <section>
+      <input value={search} onChange={(event) => setSearch(event.target.value)} />
-      {users.map((user) => (
+      {filteredUsers.map((user) => (
         <article key={user.id}>{user.name}</article>
       ))}
     </section>`,
  hunks: [
    {
      header: "@@ -1,6 +1,12 @@",
      lines: [
        "-import { users } from './data';",
        "+import { useMemo, useState } from 'react';",
        "+import { users } from './data';",
        " export function UserList() {",
        "+  const [search, setSearch] = useState('');",
        "   return (",
        "+      <input value={search} onChange={(event) => setSearch(event.target.value)} />",
        "-      {users.map((user) => (",
        "+      {filteredUsers.map((user) => ("
      ]
    }
  ]
};

export const demoSession: Session = {
  id: "session_1",
  projectId: "repo_1",
  messages: [
    {
      id: "m1",
      role: "assistant",
      content: "已加载项目快照。这是一个 React + TypeScript 项目，使用 Vite 构建。",
      createdAt: "2026-05-10T08:31:10.000Z"
    },
    {
      id: "m2",
      role: "user",
      content: "帮我给 UserList 组件加一个搜索框",
      createdAt: "2026-05-10T08:32:00.000Z"
    }
  ],
  pendingChanges: [demoDiff],
  status: "active",
  createdAt: "2026-05-10T08:31:10.000Z"
};

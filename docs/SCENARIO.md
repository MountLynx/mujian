# 手稿格式 · 世界观与角色

一份 run 从一份剧本手稿开始。预置剧本在 [`content/scenarios/`](../content/scenarios/) 下，也可以在前端「新建推演 → 自定义手稿」里直接粘贴 JSON。

服务端在创建 run 时会归一化并校验手稿，错误会以字段级 issue 返回。

---

## 最小可运行结构

```json
{
  "title": "晚潮公馆",
  "subtitle": "一句副标题",
  "kicker": "暴雨夜 · 第三次守灵",
  "world": {
    "title": "晚潮公馆",
    "era": "架空近代",
    "tone": "阴郁克制的家族悬疑",
    "setting": "世界与场所的完整描述。建议写清楚这个世界最特殊的规则。",
    "location": "当前场景。所有角色都在这里。",
    "dateLabel": "守灵第三夜",
    "startClock": "23:10",
    "premise": "开场冲突。",
    "opening": "开场描写。可多段。",
    "directorNotes": "给导演的节奏与基调提示。",
    "hiddenCanon": "只有导演知道的真相或骨架，用来保护伏笔。可选。",
    "initialFacts": ["所有人一开始就知道的事实。"],
    "countdown": "零点宣读遗嘱"
  },
  "rules": {
    "maxBeats": 4,
    "difficultyGuidance": "普通动作 DC 15；有准备 DC 12–13；被多人注视 DC 18。"
  },
  "characters": [
    {
      "id": "lin_shu",
      "name": "林述",
      "title": "晚潮公馆的年轻管家",
      "age": "29",
      "pronouns": "他",
      "publicProfile": "公开形象与别人能看出来的东西。",
      "appearance": "可选的外貌描述。",
      "personality": "性格。写具体的习惯、防御方式和矛盾，不要只写标签。",
      "desire": "他真正想要什么。越具体越好。",
      "fear": "他最怕什么。恐惧应该能被行动触碰。",
      "secret": "只有他自己和导演知道的事。不要把秘密写成公开简介。",
      "abilities": {
        "physique": 5,
        "agility": 6,
        "perception": 8,
        "intellect": 6,
        "will": 7,
        "presence": 5
      },
      "traits": [
        {
          "name": "听见门响",
          "description": "能凭声音判断房子哪一扇门被打开过。",
          "bonus": 2,
          "ability": "perception"
        }
      ],
      "possessions": ["二楼钥匙", "遗嘱副本"],
      "relationships": [
        {
          "targetId": "qiu_yin",
          "label": "律师 / 不速之客",
          "attitude": "她知道的事情比她说出来的多。"
        }
      ],
      "memories": [
        {
          "summary": "老太爷清醒时叫过一个女人的名字。",
          "detail": "那个名字写在遗嘱副本上。",
          "importance": 5
        }
      ],
      "conditions": [
        {
          "name": "轻微头痛",
          "description": "雨声让它更糟。",
          "modifier": -1,
          "kind": "injury",
          "abilities": ["perception"]
        }
      ]
    },
    {
      "id": "qiu_yin",
      "name": "邱吟",
      "title": "前来宣读遗嘱的律师",
      "personality": "冷静、精确，擅长把问题还给提问的人。",
      "desire": "完成宣读并保住执照。",
      "fear": "被揭穿修改过契约日期。",
      "secret": "她带着一份自己准备过的替代遗嘱。",
      "abilities": {
        "physique": 4,
        "agility": 5,
        "perception": 6,
        "intellect": 8,
        "will": 7,
        "presence": 7
      },
      "traits": [],
      "possessions": ["律师皮箱", "旧钢笔"],
      "relationships": [],
      "memories": []
    }
  ]
}
```

至少 **2 名**、最多 **6 名**角色。每次 run 的角色都在同一个场景里活动。至少需要一位主动角色；`"passive": true` 的角色不宣告举动、不进入回应回合，适合昏迷、沉睡、缺席但仍在场的人。

---

## 字段说明

### 顶层

| 字段 | 必填 | 说明 |
|---|---|---|
| `title` | ✅ | 剧本标题 |
| `subtitle` | | 一句副标题，会显示在首页与页面标题区 |
| `kicker` | | 小标签，如“归潮夜 · 第 17 年” |
| `world` | ✅ | 世界与场景，见下 |
| `rules` | | `maxBeats` 默认 5，限制 3–12；`difficultyGuidance` 会带给裁定导演 |
| `characters` | ✅ | 2–6 位角色 |

### world

| 字段 | 必填 | 说明 |
|---|---|---|
| `setting` | ✅ | 世界、规则、背景。**不要写只有某个角色知道的秘密**；这是共享材料 |
| `location` | ✅ | 当前封闭场景 |
| `premise` | ✅ | 开场冲突 |
| `opening` | ✅ | 开场描写，第一刻之前的世界状态 |
| `era` | | 时代/类型标签 |
| `tone` | | 文风提示，直接进入 导演系统提示 |
| `dateLabel` | | 日期标签，如“归潮夜” |
| `startClock` | | `HH:MM`，默认 `22:40` |
| `directorNotes` | | 节奏、边界、主题；仅导演可见 |
| `hiddenCanon` | | 世界真相或伏笔骨架；仅导演可见，不进入角色提示词 |
| `initialFacts` | | 所有角色开场已确认的公开事实 |
| `countdown` | | 给全场的压力/期限，如“23:55 末班船开” |
| `deadlineClock` | | 结构化的期限时钟 `HH:MM`；省略时从 `countdown` 里解析第一个时间。它只关闭选项，不决定人物怎么反应 |
| `deadlineFact` | | 期限到达、且没有新的“晚点/停航”公开事实时，写入的公开世界事实。例：“末班渡轮在 23:55 离岸。”这是世界时钟，不是 `endingCondition` |

`hiddenCanon` 不是结局脚本，而是“不能随便改写的世界事实”。写清楚哪些秘密是真的、哪些只是角色以为的，能显著减少推演自相矛盾。

`deadlineClock` / `deadlineFact` 也不是结局脚本：它们只说明“到点之后哪个选项关闭”。人物可以赶上、错过、选择不走，或者用一个新的公开事实把船延迟；这些选择仍然由推演产生。

### character

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | | 稳定标识；缺省由名字生成；重名会自动加后缀 |
| `name` | ✅ | 角色名 |
| `title` | | 身份/职业 |
| `age`, `pronouns` | | 可选 |
| `publicProfile` | | 他人能看到的公开资料 |
| `appearance` | | 可选外貌 |
| `personality` | ✅ | 性格、习惯、防御方式、矛盾 |
| `desire` | ✅ | 具体、可追求的欲望 |
| `fear` | ✅ | 能被触碰的恐惧 |
| `secret` | | 只有自己知道的事；不写在这里的秘密不会被角色掌握 |
| `abilities` | | 6 项，1–10；缺省 5；超出范围自动 clamp |
| `traits` | | 机械特质，见下 |
| `possessions` | | 初始随身物 |
| `relationships` | | 目标角色必须存在于同一剧本 |
| `memories` | | 角色初始记忆，1–5 重要性 |
| `conditions` | | 初始状态，会影响对应检定；可写 `visibility: public/private` |
| `passive` | | `true` 表示被动角色：不宣告举动、不进入回应回合，但仍可被指向、被观察、被改变 |

### 能力 key

```text
physique   体魄
agility    敏捷
perception 感知
intellect  智识
will       意志
presence   风度
```

### traits

```json
{
  "name": "听雾",
  "description": "能从回声、汽笛和雨声里分辨船位。",
  "bonus": 2,
  "ability": "perception"
}
```

- `bonus` 会被限制在 -2…4。
- `ability` 可省略；省略表示任意能力检定都可选。
- 角色必须**主动选择**某个特质才获得加值。特质不是永久被动光环，避免“所有检定都自动加值”。
- 特质名必须在角色提示词里准确出现，并由 LLM 返回；不匹配则不加值。

### memories

```json
{
  "summary": "一句话，角色会记住的内容。",
  "detail": "更具体的场景、感官与矛盾。",
  "importance": 4
}
```

记忆是**该角色的主观记忆**，可以包含误读、愧疚或偏见。`importance` 影响长局记忆裁剪时的保留优先级。角色提示词最多带约 14 条，超长时会优先保留旧事和高重要性条目。

运行时，每个完成的时刻还会自动追加一条本刻记忆；导演也可以给出更私密的版本。其他角色永远不会看到这条记忆。

### conditions

```json
{
  "name": "右手受伤",
  "description": "握枪时手抖。",
  "modifier": -2,
  "kind": "injury",
  "visibility": "public",
  "abilities": ["agility", "physique"]
}
```

- `modifier` −4…4，总状态修正限制 −8…+8。
- `abilities` 可省略，表示所有能力检定都受影响。
- `kind`: `injury` / `emotion` / `boon` / `other`。
- `visibility`: `public`（旁人能看见）或 `private`（只有本人知道）。可省略；默认 `emotion` 为 private，其余为 public。

### relationships

```json
{
  "targetId": "gu_xingzhou",
  "label": "旧识 / 审查者",
  "attitude": "我不信他，但他身上有和父亲一样的海腥味。"
}
```

关系是角色**主观**的态度。`label` 展示给 UI，`attitude` 进入该角色的提示词。目标不存在时该条会被丢弃。

---

## 好手稿的几个建议

1. **让欲望互相冲突。** 每个人都有合理目标，才会真正争抢同一件东西。
2. **秘密必须可行动化。** “他有一段悲伤往事”很难演；“他偷走了证物，而失主正在场”可以被行动撞破。
3. **公开资料、私人秘密、世界设定分开写。** 不要把隐藏真相放进 `publicProfile` 或 `setting`。
4. **给每个人一个具体物件。** 灯芯、磁带、钥匙、封条比抽象动机更容易产生交互。
5. **写清不可违反的物理事实。** 断电、潮水时间、门锁位置会让失败与代价更真实。
6. **不要预设角色的选择。** `directorNotes` 应写基调、节奏与边界，而不是“沈砚一定会点灯”。
7. **能力点与性格要一致，但不必完美。** 一个感知 8、风度 4 的人可以看见所有细节却说服不了任何人，这就是戏。

---

## 新增预置剧本

1. 在 `content/scenarios/` 新建 `<slug>.json`。
2. 使用上面的结构；可以带 `isPreset: true`（服务端加载时也会标记）。
3. 重启服务或刷新 `/api/scenarios` 即可在新建页看到。
4. 运行 `node --test tests/scenario.test.ts` 会检查 `fog-harbor`，你也可以给自己的剧本加测试。

前端自定义手稿没有单独的字段表单：这是一个给作者的工具，JSON 能完整表达关系、状态、条件与隐藏设定。空白模板可在「自定义手稿」里一键载入。

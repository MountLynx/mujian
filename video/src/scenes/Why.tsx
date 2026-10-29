import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { Headline, Kicker, Micro, SceneShell, useFadeUp } from '../components';
import { C, F } from '../theme';

const pillars = [
  ['01', '世界层', '时间与因果'],
  ['02', '聚焦层', '人物与选择'],
  ['03', '规则层', '骰点与后果'],
];

const BeatOne = ({ visible }: { visible: boolean }) => {
  const first = useFadeUp(4, 18, 12);
  const second = useFadeUp(10, 20, 16);
  const labels = useFadeUp(26, 18, 10);
  return (
    <AbsoluteFill style={{ opacity: visible ? 1 : 0, padding: '166px 104px 112px' }}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Kicker delay={0}>WHY THIS EXISTS</Kicker>
          <div style={first}>
            <p style={{ fontFamily: F.serif, fontSize: 46, lineHeight: 1.6, color: C.ink2, margin: 0, letterSpacing: '0.02em' }}>
              不是让 AI 续写小说。
            </p>
          </div>
          <div style={second}>
            <Headline size={68} style={{ maxWidth: 1080 }}>
              而是让每个人物，
              <br />
              只依据<span style={{ color: C.gold2 }}>自己知道的事</span>行动。
            </Headline>
          </div>
        </div>
        <div
          style={{
            ...labels,
            display: 'flex',
            gap: 54,
            paddingTop: 22,
            borderTop: `1px solid ${C.line}`,
            width: 980,
          }}
        >
          {pillars.map(([num, name, note]) => (
            <div key={num} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Micro style={{ color: C.gold }}>{num}</Micro>
              <span style={{ fontFamily: F.sans, fontSize: 23, color: C.ink }}>{name}</span>
              <Micro>{note}</Micro>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ComparePanel = ({
  tone,
  label,
  title,
  bullets,
  footer,
  delay,
}: {
  tone: 'muted' | 'gold';
  label: string;
  title: string;
  bullets: string[];
  footer: string;
  delay: number;
}) => {
  const style = useFadeUp(delay, 20, 16);
  const gold = tone === 'gold';
  return (
    <div
      style={{
        ...style,
        width: 620,
        minHeight: 330,
        border: `1px solid ${gold ? C.lineStrong : C.line}`,
        borderLeft: gold ? `2px solid ${C.gold}` : `1px solid ${C.line}`,
        background: gold ? 'rgba(201,167,107,0.055)' : 'rgba(15,25,30,0.66)',
        borderRadius: 10,
        padding: '28px 30px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <Micro style={{ color: gold ? C.gold : C.ink3, letterSpacing: '0.2em' }}>{label}</Micro>
      <div style={{ fontFamily: F.serif, fontSize: 30, color: gold ? C.ink : C.ink2 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
        {bullets.map((line) => (
          <div key={line} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: gold ? C.gold : C.ink3, marginTop: 9, flex: 'none' }} />
            <span style={{ fontFamily: F.sans, fontSize: 18, lineHeight: 1.7, color: gold ? C.ink2 : C.ink3 }}>{line}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
        <Micro style={{ color: gold ? C.gold2 : C.ink3 }}>{footer}</Micro>
      </div>
    </div>
  );
};

const BeatTwo = ({ visible }: { visible: boolean }) => {
  const headline = useFadeUp(190, 20, 16);
  const quote = useFadeUp(226, 18, 10);
  const flow = useFadeUp(244, 18, 8);
  return (
    <AbsoluteFill style={{ opacity: visible ? 1 : 0, padding: '150px 104px 96px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 30 }}>
        <Kicker delay={184}>THE DIFFERENCE</Kicker>
        <div style={headline}>
          <Headline size={52} style={{ textAlign: 'center', maxWidth: 1200 }}>
            一份真相，还是每个人一份？
          </Headline>
        </div>
        <div style={{ display: 'flex', gap: 46, marginTop: 8 }}>
          <ComparePanel
            tone="muted"
            label="ONE OMNISCIENT VOICE / 续写"
            title="一个全知叙述者"
            bullets={['所有人共享同一份真相', '冲突来自作者的安排', '角色知道剧情需要他知道的事']}
            footer="读者知道得比角色多"
            delay={198}
          />
          <ComparePanel
            tone="gold"
            label="ONE MIND PER CHARACTER / 幕间"
            title="每个人一份世界"
            bullets={['每个人只拿到自己的可知信息', '冲突来自信息差', '秘密、误会与误判被保留']}
            footer="角色只知道自己的那一份"
            delay={208}
          />
        </div>
        <div style={{ ...quote, marginTop: 18, textAlign: 'center' }}>
          <p style={{ fontFamily: F.serif, fontSize: 24, lineHeight: 1.7, color: C.ink2, margin: 0 }}>
            “潮水等得到。你等的是什么？”
          </p>
          <Micro style={{ display: 'inline-block', marginTop: 8 }}>阿婆与林生，听见的不是同一句话。</Micro>
        </div>
        <div style={{ ...flow, display: 'flex', alignItems: 'center', gap: 14, marginTop: 8 }}>
          {['信息差', '秘密', '选择', '后果'].map((item, i) => (
            <span key={item} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontFamily: F.sans, fontSize: 14, color: i === 3 ? C.gold2 : C.ink3 }}>{item}</span>
              {i < 3 ? <span style={{ color: C.gold, fontFamily: F.mono, fontSize: 12 }}>→</span> : null}
            </span>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const Why = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const first = frame < 180;
  return (
    <SceneShell duration={duration} chapter="00 / WHY" fullBleed>
      <AbsoluteFill>
        <Img
          src={staticFile('screens/home.png')}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: 0.13,
            filter: 'blur(2px) saturate(0.75)',
            transform: 'scale(1.04)',
          }}
        />
        <AbsoluteFill
          style={{
            background:
              'linear-gradient(90deg, rgba(7,13,16,0.97) 0%, rgba(7,13,16,0.9) 38%, rgba(7,13,16,0.55) 72%, rgba(7,13,16,0.78) 100%)',
          }}
        />
        <AbsoluteFill
          style={{
            background: 'radial-gradient(1000px 700px at 78% 36%, rgba(201,167,107,0.08) 0%, transparent 62%)',
          }}
        />
      </AbsoluteFill>
      <BeatOne visible={first} />
      <BeatTwo visible={!first} />
    </SceneShell>
  );
};

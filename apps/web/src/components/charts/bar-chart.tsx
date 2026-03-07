'use client';

import dynamic from 'next/dynamic';

const Bar = dynamic(() => import('@ant-design/charts').then((mod) => mod.Bar), {
  ssr: false,
  loading: () => <div style={{ height: 300, background: '#fafafa', borderRadius: 8 }} />,
});

interface BarChartProps {
  data: Array<Record<string, any>>;
  xField: string;
  yField: string;
  colorField?: string;
  height?: number;
  color?: string | string[];
  stack?: boolean;
  group?: boolean;
  label?: Record<string, any>;
}

export function BarChart({
  data,
  xField,
  yField,
  colorField,
  height = 300,
  color,
  stack,
  group,
  label,
}: BarChartProps) {
  const config: Record<string, any> = {
    data,
    xField,
    yField,
    height,
    animate: { enter: { type: 'fadeIn' } },
  };

  if (colorField) config.colorField = colorField;

  // v2: use scale.color.range for color palette, style.fill for single color
  if (color) {
    if (Array.isArray(color)) {
      config.scale = { color: { range: color } };
    } else {
      config.style = { ...(config.style ?? {}), fill: color };
    }
  }

  // v2: use transform array for stacking/grouping
  if (stack) {
    config.transform = [...(config.transform ?? []), { type: 'stackY' }];
  }
  if (group) {
    config.transform = [...(config.transform ?? []), { type: 'dodgeX' }];
  }

  if (label) config.label = label;

  return <Bar {...config} />;
}

'use client';

import dynamic from 'next/dynamic';

const Pie = dynamic(() => import('@ant-design/charts').then((mod) => mod.Pie), {
  ssr: false,
  loading: () => <div style={{ height: 300, background: '#fafafa', borderRadius: 8 }} />,
});

interface PieChartProps {
  data: Array<Record<string, any>>;
  angleField: string;
  colorField: string;
  height?: number;
  innerRadius?: number;
  color?: string[];
  label?: Record<string, any> | false;
}

export function PieChart({
  data,
  angleField,
  colorField,
  height = 300,
  innerRadius = 0.6,
  color,
  label,
}: PieChartProps) {
  const config: Record<string, any> = {
    data,
    angleField,
    colorField,
    height,
    innerRadius,
    legend: { color: { position: 'bottom' } },
    interaction: { elementHighlight: { background: true } },
    animate: { enter: { type: 'fadeIn' } },
  };

  // v2: use scale.color.range for color palette
  if (color) {
    config.scale = { color: { range: color } };
  }

  if (label === false) {
    config.label = false;
  } else if (label) {
    config.label = label;
  } else {
    config.label = { position: 'spider' };
  }

  return <Pie {...config} />;
}

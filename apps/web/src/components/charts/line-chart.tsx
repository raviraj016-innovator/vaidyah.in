'use client';

import dynamic from 'next/dynamic';

const Line = dynamic(() => import('@ant-design/charts').then((mod) => mod.Line), {
  ssr: false,
  loading: () => <div style={{ height: 300, background: '#fafafa', borderRadius: 8 }} />,
});

interface LineChartProps {
  data: Array<Record<string, any>>;
  xField: string;
  yField: string;
  colorField?: string;
  height?: number;
  smooth?: boolean;
  color?: string | string[];
}

export function LineChart({
  data,
  xField,
  yField,
  colorField,
  height = 300,
  smooth = true,
  color,
}: LineChartProps) {
  const config: Record<string, any> = {
    data,
    xField,
    yField,
    height,
    animate: { enter: { type: 'fadeIn' } },
  };

  if (colorField) config.colorField = colorField;

  // v2: use style.shape for smooth lines, not shapeField
  if (smooth) {
    config.style = { ...(config.style ?? {}), shape: 'smooth' };
  }

  // v2: use scale.color.range for color palette, not top-level color
  if (color) {
    const range = Array.isArray(color) ? color : [color];
    config.scale = { color: { range } };
  }

  return <Line {...config} />;
}

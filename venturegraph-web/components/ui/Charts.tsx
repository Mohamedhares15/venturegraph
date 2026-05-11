"use client";
// Re-export all Recharts components from a client boundary.
// Server components that import recharts directly cause SSR context errors.
// Always import recharts via this file in server component pages.
export {
  LineChart, BarChart, ScatterChart, ComposedChart, PieChart, AreaChart,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Line, Bar, Scatter, Area, Pie, Cell,
  XAxis, YAxis, ZAxis, Tooltip, Legend, CartesianGrid,
  ResponsiveContainer, ReferenceLine, ReferenceArea,
  LabelList, Label,
} from "recharts";

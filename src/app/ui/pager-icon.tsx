"use client";

import {
  Activity, ArrowLeft, ArrowRight, ArrowUpRight, AtSign, BarChart3, Bell, BookOpen, Calendar,
  CalendarClock, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight,
  Circle, CircleCheck, CircleHelp, CirclePlus, ClipboardList, Clock3, Code2, Columns2, Copy, Download,
  ExternalLink, Eye, EyeOff, FileText, Gift, Globe2, Grid2X2, HeartHandshake, Image as ImageIcon,
  Inbox, Info, LayoutGrid, Link as LinkIcon, LockKeyhole, LogOut, Mail, MapPin, Menu,
  MessageCircle, Minus, MoreHorizontal, Pencil, Plus, Quote, Search, Send, Settings, Shield,
  Share2, ShoppingBag, Sparkles, Tag, Timer, Trash2, Type, Upload, UserRound,
  Truck, UsersRound, WalletCards, X, type LucideIcon,
} from "lucide-react";

const icons: Record<string, LucideIcon> = {
  Activity, ArrowLeft, ArrowRight, ArrowUpRight, AtSign, BarChart3, Bell, BookOpen, Calendar,
  CalendarClock, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight,
  Circle, CircleCheck, CircleHelp, CirclePlus, ClipboardList, Clock3, Code2, Columns2, Copy, Download,
  ExternalLink, Eye, EyeOff, FileText, Gift, Globe2, Grid2X2, HeartHandshake, Image: ImageIcon,
  Inbox, Info, LayoutGrid, Link: LinkIcon, LockKeyhole, LogOut, Mail, MapPin, Menu,
  MessageCircle, Minus, MoreHorizontal, Pencil, Plus, Quote, Search, Send, Settings, Shield,
  Share2, ShoppingBag, Sparkles, Tag, Timer, Trash2, Truck, Type, Upload, UserRound,
  UsersRound, WalletCards, X,
};

export function Icon({ name, size = 18, strokeWidth = 2, className }: { name: string; size?: number; strokeWidth?: number; className?: string }) {
  const Component = icons[name] ?? CircleHelp;
  return <Component aria-hidden="true" size={size} strokeWidth={strokeWidth} className={className} />;
}

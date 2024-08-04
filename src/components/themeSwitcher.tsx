'use client';

import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

const ThemeSwitcher = () => {
	const [mounted, setMounted] = useState(false);
	const { theme, setTheme } = useTheme();

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) {
		return null;
	}

	return (
		<div className="cursor-pointer bg-background text-primary-green border border-b border-gray-300 p-3 rounded-lg h-full self-center  dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:dark:bg-zinc-800/30">
			
			{theme == 'dark' && <SunIcon height={24} width={24} onClick={() => setTheme('light')} />}
			{theme == 'light' && <MoonIcon height={24} width={24} onClick={() => setTheme('dark')} />}
		</div>
	);
};

export default ThemeSwitcher;
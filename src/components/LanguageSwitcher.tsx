import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import TranslateRoundedIcon from '@mui/icons-material/TranslateRounded';
import { useLanguage } from '../i18n/LanguageContext';
import { languages, type Language } from '../i18n/translations';

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <Tooltip title={t('languageSelectorLabel')}>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={language}
        onChange={(_, next: Language | null) => next && setLanguage(next)}
        aria-label={t('languageSelectorLabel')}
      >
        <ToggleButton value="fi" sx={{ px: 1.25 }}><TranslateRoundedIcon fontSize="small" sx={{ mr: 0.5 }} />FI</ToggleButton>
        {languages.filter(l => l.code !== 'fi').map(l => (
          <ToggleButton key={l.code} value={l.code} sx={{ px: 1.25 }}>{l.code.toUpperCase()}</ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Tooltip>
  );
}

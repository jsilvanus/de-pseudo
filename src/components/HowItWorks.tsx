import { Fragment } from 'react';
import { Alert, Avatar, Box, Paper, Stack, Typography } from '@mui/material';
import TableRowsRoundedIcon from '@mui/icons-material/TableRowsRounded';
import TheaterComedyRoundedIcon from '@mui/icons-material/TheaterComedyRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import LockOpenRoundedIcon from '@mui/icons-material/LockOpenRounded';
import DeleteForeverRoundedIcon from '@mui/icons-material/DeleteForeverRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/translations';

const steps: { key: TranslationKey; Icon: typeof TableRowsRoundedIcon }[] = [
  { key: 'stepData', Icon: TableRowsRoundedIcon },
  { key: 'stepPseudonymize', Icon: TheaterComedyRoundedIcon },
  { key: 'stepPrompt', Icon: EditNoteRoundedIcon },
  { key: 'stepAi', Icon: SmartToyRoundedIcon },
  { key: 'stepResolve', Icon: LockOpenRoundedIcon },
  { key: 'stepShred', Icon: DeleteForeverRoundedIcon },
];

export function HowItWorks() {
  const { t } = useLanguage();
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 3, sm: 5, md: 7 },
        background: 'linear-gradient(135deg, rgba(193,84,12,0.06), rgba(192,138,46,0.06))',
      }}
    >
      <Stack spacing={{ xs: 5, md: 7 }}>
        <Box textAlign="center">
          <Typography variant="h5">{t('howItWorksTitle')}</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>{t('howItWorksSubtitle')}</Typography>
        </Box>

        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={{ xs: 5, md: 1 }}
          alignItems={{ xs: 'stretch', md: 'flex-start' }}
        >
          {steps.map((step, i) => (
            <Fragment key={step.key}>
              <Stack alignItems="center" spacing={1.75} sx={{ flex: 1, textAlign: 'center', px: 1 }}>
                <Avatar
                  sx={{
                    width: { xs: 72, md: 88 },
                    height: { xs: 72, md: 88 },
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    boxShadow: 2,
                  }}
                >
                  <step.Icon sx={{ fontSize: { xs: 36, md: 44 } }} />
                </Avatar>
                <Typography variant="subtitle1" fontWeight={600}>{t(step.key)}</Typography>
              </Stack>
              {i < steps.length - 1 && (
                <Box
                  sx={{
                    display: { xs: 'flex', md: 'flex' },
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'text.disabled',
                    transform: { xs: 'rotate(90deg)', md: 'none' },
                    py: { xs: 0, md: 0 },
                    pt: { md: '30px' },
                  }}
                >
                  <ArrowForwardRoundedIcon />
                </Box>
              )}
            </Fragment>
          ))}
        </Stack>

        <Stack spacing={2.5}>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 820, mx: 'auto', textAlign: 'center' }}>
            {t('howItWorksDescription')}
          </Typography>
          <Alert severity="info" icon={false} sx={{ maxWidth: 820, mx: 'auto' }}>
            <b>{t('noticeLabel')}</b> {t('noticeBody')}
          </Alert>
        </Stack>
      </Stack>
    </Paper>
  );
}

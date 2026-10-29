import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Plus, Search, X } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { useLanguageStore } from '@/store/language-store';
import { useFinanceStore, EXPENSE_CATEGORIES, type CustomCategory } from '@/store/finance-store';
import { useBuddyStore } from '@/store/buddy-store';
import {
  categoryMatchesQuery,
  CATEGORY_SEARCH_SYNONYMS,
  DEFAULT_TOP_EXPENSE_CATEGORIES,
  foldCategoryText,
  formatCategoryDisplay,
  isPickerExpenseCategory,
  mainCategoryName,
  suggestCategoryFromDescription,
  type NormalizedCategory,
} from '@/lib/category-normalize';
import { defaultSubcategoriesFor, getExpenseCategoryDef } from '@/constants/categories';
import { classifyImportRow } from '@/lib/classify-import-category';

const DEFAULT_TOP_INCOME = ['Mzda', 'Freelance', 'Ostatní'] as const;

type SearchHit = {
  key: string;
  category: string;
  subcategory: string | null;
  label: string;
  color: string;
};

export type CategoryPickerProps = {
  type: 'income' | 'expense';
  selectedCategory: string;
  selectedSubcategory: string | null;
  /** Popis transakce — pro návrh kategorie */
  description: string;
  onChange: (category: string, subcategory: string | null, manual: boolean) => void;
  /** grid = 2 sloupce (tab Přidat), chips = top-3 + Další (zalamovaná mřížka) */
  layout?: 'grid' | 'chips';
  /** Zobrazit tlačítko „nová kategorie“ / „+ Vlastní“ */
  allowCreateCategory?: boolean;
  onRequestCreateCategory?: () => void;
};

export function CategoryPicker({
  type,
  selectedCategory,
  selectedSubcategory,
  description,
  onChange,
  layout = 'grid',
  allowCreateCategory = false,
  onRequestCreateCategory,
}: CategoryPickerProps) {
  const { colors } = useTheme();
  const { t } = useLanguageStore();
  const {
    getAllCategories,
    getCustomSubcategories,
    transactions,
    customCategories,
    addCustomCategory,
  } = useFinanceStore();
  const { addPoints } = useBuddyStore();

  const [categoryQuery, setCategoryQuery] = useState('');
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [chipsExpanded, setChipsExpanded] = useState(false);
  const [categoryPickedManually, setCategoryPickedManually] = useState(false);
  const [suggestedCategory, setSuggestedCategory] = useState<NormalizedCategory | null>(null);
  const [addingSubcategory, setAddingSubcategory] = useState(false);
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [addingCustomMain, setAddingCustomMain] = useState(false);
  const [newCustomMainName, setNewCustomMainName] = useState('');
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const categoryData = getAllCategories(type);

  const pickerCategories = useMemo(() => {
    return Object.entries(categoryData)
      .filter(([name]) => (type === 'expense' ? isPickerExpenseCategory(name) : name !== 'Převod'))
      .map(([name, data]) => ({
        id: name,
        name,
        color: data.color,
        icon: data.icon || '📦',
      }));
  }, [categoryData, type]);

  /** Top 3 (chips) nebo top 6 (grid). */
  const topCategoryNames = useMemo(() => {
    const defaults =
      type === 'income'
        ? [...DEFAULT_TOP_INCOME]
        : [...DEFAULT_TOP_EXPENSE_CATEGORIES].slice(0, 3);
    const want = layout === 'chips' ? 3 : 6;
    const counts = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.type !== type) continue;
      const cat = mainCategoryName(tx.category, tx.subcategory);
      if (type === 'expense' && !isPickerExpenseCategory(cat)) continue;
      if (type === 'income' && cat === 'Převod') continue;
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
    if (ranked.length === 0) {
      return defaults.slice(0, want);
    }
    const top = ranked.slice(0, want);
    while (top.length < want) {
      const fill = defaults.find((c) => !top.includes(c));
      if (!fill) break;
      top.push(fill);
    }
    return top;
  }, [transactions, type, layout]);

  const chipsCollapsedNames = useMemo(() => {
    const top = [...topCategoryNames].slice(0, 3);
    if (
      selectedCategory &&
      !top.includes(selectedCategory) &&
      pickerCategories.some((c) => c.id === selectedCategory)
    ) {
      return [selectedCategory, ...top.filter((n) => n !== selectedCategory)].slice(0, 3);
    }
    return top;
  }, [topCategoryNames, selectedCategory, pickerCategories]);

  const searchHits = useMemo((): SearchHit[] => {
    const q = categoryQuery.trim();
    if (!q || layout !== 'chips') return [];
    const qFold = foldCategoryText(q);
    const hits: SearchHit[] = [];
    const seen = new Set<string>();

    const push = (category: string, subcategory: string | null, label: string, color: string) => {
      const key = `${category}::${subcategory ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      hits.push({ key, category, subcategory, label, color });
    };

    for (const cat of pickerCategories) {
      const icon = cat.icon;
      const nameFold = foldCategoryText(cat.name);
      const syns = CATEGORY_SEARCH_SYNONYMS[cat.name];
      const mainHit =
        nameFold.includes(qFold) || Boolean(syns?.some((s) => s.includes(qFold) || qFold.includes(s)));
      if (mainHit) {
        push(cat.name, null, `${icon} ${cat.name}`, cat.color);
      }
      for (const sub of defaultSubcategoriesFor(cat.name)) {
        const subFold = foldCategoryText(sub);
        const pathFold = foldCategoryText(`${cat.name} › ${sub}`);
        if (subFold.includes(qFold) || pathFold.includes(qFold)) {
          push(cat.name, sub, `${icon} ${cat.name} › ${sub}`, cat.color);
        }
      }
      for (const c of getCustomSubcategories(cat.name) || []) {
        const sub = c.name;
        if (foldCategoryText(sub).includes(qFold)) {
          push(cat.name, sub, `${icon} ${cat.name} › ${sub}`, cat.color);
        }
      }
    }
    return hits.slice(0, 16);
  }, [categoryQuery, layout, pickerCategories, getCustomSubcategories, customCategories]);

  const visibleCategories = useMemo(() => {
    const q = categoryQuery.trim();
    if (q && layout === 'grid') {
      return pickerCategories.filter((c) => categoryMatchesQuery(c.name, q));
    }
    if (layout === 'chips') {
      if (q) return []; // chips: search hits místo hlavního seznamu
      if (chipsExpanded) return pickerCategories;
      const set = new Set(chipsCollapsedNames);
      return pickerCategories.filter((c) => set.has(c.name));
    }
    if (type === 'income' || showAllCategories) return pickerCategories;
    const topSet = new Set(topCategoryNames);
    return pickerCategories.filter((c) => topSet.has(c.name));
  }, [
    categoryQuery,
    pickerCategories,
    showAllCategories,
    topCategoryNames,
    type,
    layout,
    chipsExpanded,
    chipsCollapsedNames,
  ]);

  const subcategoryChips = useMemo(() => {
    if (type !== 'expense' || !selectedCategory) return [] as string[];
    const defaults = [...defaultSubcategoriesFor(selectedCategory)];
    const custom = (getCustomSubcategories(selectedCategory) || []).map((c) => c.name);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of [...defaults, ...custom]) {
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    return out;
  }, [type, selectedCategory, getCustomSubcategories, customCategories]);

  useEffect(() => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (categoryPickedManually) return;
    const text = description.trim();
    if (text.length < 2) {
      setSuggestedCategory(null);
      return;
    }
    suggestTimer.current = setTimeout(() => {
      let next: NormalizedCategory | null = suggestCategoryFromDescription(text, type);
      if (!next && type === 'expense') {
        const classified = classifyImportRow({
          type: 'expense',
          description: text,
          title: text,
        });
        if (
          classified.category &&
          classified.category !== 'Ostatní' &&
          (classified.source === 'keywords' ||
            classified.source === 'dictionary' ||
            classified.source === 'special')
        ) {
          next = {
            category: classified.category,
            subcategory: classified.subcategory ?? null,
          };
        }
      }
      if (next && type === 'expense') {
        if (!isPickerExpenseCategory(next.category) && next.category !== 'Investice') {
          if (!Object.keys(EXPENSE_CATEGORIES).includes(next.category)) next = null;
          else if (!isPickerExpenseCategory(next.category)) next = null;
        }
      }
      setSuggestedCategory(next);
      if (next && !selectedCategory) {
        onChange(next.category, next.subcategory, false);
      }
    }, 300);
    return () => {
      if (suggestTimer.current) clearTimeout(suggestTimer.current);
    };
    // onChange záměrně mimo deps — rodič často předá inline callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description, type, categoryPickedManually, selectedCategory]);

  const pickCategory = useCallback(
    (name: string, manual: boolean, sub?: string | null) => {
      if (manual) {
        setCategoryPickedManually(true);
        setSuggestedCategory(null);
      }
      setAddingSubcategory(false);
      setNewSubcategoryName('');
      onChange(name, sub ?? null, manual);
    },
    [onChange],
  );

  const pickSuggested = () => {
    if (!suggestedCategory) return;
    pickCategory(suggestedCategory.category, true, suggestedCategory.subcategory);
  };

  const handleCreateSubcategory = () => {
    const name = newSubcategoryName.trim();
    if (!name || !selectedCategory) return;
    const newCategory: CustomCategory = {
      id: Date.now().toString(),
      name,
      icon: getExpenseCategoryDef(selectedCategory)?.icon || '📦',
      color: getExpenseCategoryDef(selectedCategory)?.color || '#6B7280',
      type: 'expense',
      parentCategory: selectedCategory,
    };
    addCustomCategory(newCategory);
    setCategoryPickedManually(true);
    setSuggestedCategory(null);
    setAddingSubcategory(false);
    setNewSubcategoryName('');
    onChange(selectedCategory, name, true);
    addPoints(1);
  };

  return (
    <View>
      <View
        style={[
          styles.categorySearchRow,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Search color={colors.textSecondary} size={18} />
        <TextInput
          style={[styles.categorySearchInput, { color: colors.text }]}
          value={categoryQuery}
          onChangeText={setCategoryQuery}
          placeholder={t('addTransaction.searchCategory')}
          placeholderTextColor={colors.textSecondary}
          autoCorrect={false}
        />
        {categoryQuery ? (
          <TouchableOpacity onPress={() => setCategoryQuery('')} hitSlop={8}>
            <X color={colors.textSecondary} size={16} />
          </TouchableOpacity>
        ) : null}
      </View>

      {suggestedCategory && !categoryPickedManually ? (
        <View style={[styles.suggestChip, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <TouchableOpacity style={styles.suggestChipMain} onPress={pickSuggested} activeOpacity={0.85}>
            <Text style={[styles.suggestChipText, { color: colors.text }]}>
              {t('addTransaction.suggestedCategory', {
                icon:
                  categoryData[suggestedCategory.category]?.icon ||
                  getExpenseCategoryDef(suggestedCategory.category)?.icon ||
                  '📦',
                name: formatCategoryDisplay(
                  suggestedCategory.category,
                  suggestedCategory.subcategory,
                  { withIcon: false },
                ).replace(' · ', ' › '),
              })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setSuggestedCategory(null);
              if (selectedCategory === suggestedCategory.category) {
                onChange('', null, false);
              }
            }}
            hitSlop={8}
          >
            <X color={colors.textSecondary} size={16} />
          </TouchableOpacity>
        </View>
      ) : null}

      {layout === 'chips' ? (
        <View style={styles.chipsWrap}>
          {categoryQuery.trim() ? (
            searchHits.length === 0 ? (
              <Text style={{ color: colors.textSecondary, fontSize: 13, paddingVertical: 4 }}>
                {t('addTransaction.noCategoryResults')}
              </Text>
            ) : (
              searchHits.map((hit) => {
                const isSelected =
                  selectedCategory === hit.category &&
                  (selectedSubcategory ?? null) === (hit.subcategory ?? null);
                return (
                  <TouchableOpacity
                    key={hit.key}
                    testID={`category-search-${hit.key}`}
                    style={[
                      styles.mainChip,
                      {
                        backgroundColor: isSelected ? hit.color + '22' : colors.surface,
                        borderColor: isSelected ? hit.color : colors.border,
                      },
                    ]}
                    onPress={() => {
                      setCategoryQuery('');
                      setChipsExpanded(false);
                      pickCategory(hit.category, true, hit.subcategory);
                    }}
                  >
                    <Text
                      style={{
                        color: isSelected ? hit.color : colors.text,
                        fontWeight: isSelected ? '700' : '500',
                        fontSize: 13,
                      }}
                      numberOfLines={1}
                    >
                      {hit.label}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )
          ) : (
            <>
              {visibleCategories.map((category) => {
                const isSelected = selectedCategory === category.id;
                return (
                  <TouchableOpacity
                    key={category.id}
                    testID={`category-${category.id}`}
                    style={[
                      styles.mainChip,
                      {
                        backgroundColor: isSelected ? category.color + '22' : colors.surface,
                        borderColor: isSelected ? category.color : colors.border,
                      },
                    ]}
                    onPress={() => pickCategory(category.id, true, null)}
                  >
                    <Text style={{ fontSize: 16 }}>{category.icon}</Text>
                    <Text
                      style={{
                        color: isSelected ? category.color : colors.text,
                        fontWeight: isSelected ? '700' : '500',
                        fontSize: 13,
                      }}
                      numberOfLines={1}
                    >
                      {category.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {!chipsExpanded ? (
                <TouchableOpacity
                  testID="category-more"
                  style={[
                    styles.mainChip,
                    { backgroundColor: colors.muted, borderColor: colors.border },
                  ]}
                  onPress={() => setChipsExpanded(true)}
                >
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>
                    {t('addTransaction.moreCategories')}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {allowCreateCategory !== false ? (
                addingCustomMain ? (
                  <View
                    style={[
                      styles.mainChip,
                      styles.customMainInputChip,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                  >
                    <TextInput
                      style={{ color: colors.text, minWidth: 100, fontSize: 13, padding: 0, flex: 1 }}
                      value={newCustomMainName}
                      onChangeText={setNewCustomMainName}
                      placeholder={t('addTransaction.customCategoryPlaceholder')}
                      placeholderTextColor={colors.textSecondary}
                      autoFocus
                      onSubmitEditing={() => {
                        const name = newCustomMainName.trim();
                        if (!name) return;
                        const newCategory: CustomCategory = {
                          id: Date.now().toString(),
                          name,
                          icon: '📦',
                          color: '#6B7280',
                          type,
                        };
                        addCustomCategory(newCategory);
                        setAddingCustomMain(false);
                        setNewCustomMainName('');
                        setChipsExpanded(true);
                        pickCategory(name, true, null);
                        addPoints(1);
                      }}
                    />
                    <TouchableOpacity
                      onPress={() => {
                        const name = newCustomMainName.trim();
                        if (!name) return;
                        const newCategory: CustomCategory = {
                          id: Date.now().toString(),
                          name,
                          icon: '📦',
                          color: '#6B7280',
                          type,
                        };
                        addCustomCategory(newCategory);
                        setAddingCustomMain(false);
                        setNewCustomMainName('');
                        setChipsExpanded(true);
                        pickCategory(name, true, null);
                        addPoints(1);
                      }}
                      hitSlop={6}
                    >
                      <Plus color={colors.primary} size={16} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setAddingCustomMain(false);
                        setNewCustomMainName('');
                      }}
                      hitSlop={6}
                    >
                      <X color={colors.textSecondary} size={14} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    testID="category-custom"
                    style={[
                      styles.mainChip,
                      { backgroundColor: colors.muted, borderColor: colors.border },
                    ]}
                    onPress={() => {
                      if (onRequestCreateCategory) {
                        onRequestCreateCategory();
                      } else {
                        setAddingCustomMain(true);
                      }
                    }}
                  >
                    <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>
                      {t('addTransaction.customCategory')}
                    </Text>
                  </TouchableOpacity>
                )
              ) : null}
            </>
          )}
        </View>
      ) : (
        <View style={styles.categoryGrid}>
          {visibleCategories.map((category) => {
            const isSelected = selectedCategory === category.id;
            return (
              <TouchableOpacity
                key={category.id}
                testID={`category-${category.id}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                style={[
                  styles.categoryCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                  isSelected && styles.categoryCardSelected,
                  isSelected ? { borderColor: category.color } : null,
                ]}
                onPress={() => pickCategory(category.id, true, null)}
              >
                <View
                  style={[
                    styles.categoryIcon,
                    {
                      backgroundColor: isSelected ? category.color + '33' : category.color + '20',
                      borderWidth: isSelected ? 2 : 0,
                      borderColor: isSelected ? category.color : 'transparent',
                    },
                  ]}
                >
                  <Text style={{ fontSize: 24 }}>{category.icon}</Text>
                </View>
                <Text
                  style={[
                    styles.categoryText,
                    { color: colors.text },
                    isSelected ? { color: category.color, fontWeight: '700' } : null,
                  ]}
                  numberOfLines={1}
                >
                  {category.name}
                </Text>
              </TouchableOpacity>
            );
          })}

          {allowCreateCategory ? (
            <TouchableOpacity
              style={[
                styles.categoryCard,
                styles.addCategoryCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={() => onRequestCreateCategory?.()}
            >
              <View style={[styles.categoryIcon, { backgroundColor: colors.muted }]}>
                <Plus color={colors.textSecondary} size={24} />
              </View>
              <Text style={[styles.categoryText, { color: colors.textSecondary }]}>
                {t('addTransaction.newCategory')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {type === 'expense' && selectedCategory ? (
        <View style={styles.subcategorySection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.subcategoryRow}
          >
            {subcategoryChips.map((sub) => {
              const active = selectedSubcategory === sub;
              return (
                <TouchableOpacity
                  key={sub}
                  style={[
                    styles.subcategoryChip,
                    {
                      backgroundColor: active ? colors.primary + '22' : colors.surface,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => {
                    setCategoryPickedManually(true);
                    setSuggestedCategory(null);
                    onChange(selectedCategory, active ? null : sub, true);
                  }}
                >
                  <Text
                    style={{
                      color: active ? colors.primary : colors.text,
                      fontWeight: active ? '700' : '500',
                      fontSize: 13,
                    }}
                  >
                    {sub}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {addingSubcategory ? (
              <View
                style={[
                  styles.subcategoryChip,
                  styles.subcategoryInputChip,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <TextInput
                  style={{ color: colors.text, minWidth: 100, fontSize: 13, padding: 0 }}
                  value={newSubcategoryName}
                  onChangeText={setNewSubcategoryName}
                  placeholder={t('addTransaction.subcategoryPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  autoFocus
                  onSubmitEditing={handleCreateSubcategory}
                />
                <TouchableOpacity onPress={handleCreateSubcategory} hitSlop={6}>
                  <Plus color={colors.primary} size={16} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[
                  styles.subcategoryChip,
                  { backgroundColor: colors.muted, borderColor: colors.border },
                ]}
                onPress={() => setAddingSubcategory(true)}
              >
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>
                  {t('addTransaction.addSubcategory')}
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      ) : null}

      {layout === 'grid' && type === 'expense' && !categoryQuery && !showAllCategories ? (
        <TouchableOpacity
          style={[styles.showAllCategoriesBtn, { borderColor: colors.border }]}
          onPress={() => setShowAllCategories(true)}
        >
          <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }}>
            {t('addTransaction.showAllCategories')}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  categorySearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  categorySearchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  suggestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  suggestChipMain: { flex: 1 },
  suggestChipText: { fontSize: 13, fontWeight: '600' },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryCard: {
    width: '47%',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
  },
  categoryCardSelected: {
    transform: [{ scale: 1.02 }],
  },
  addCategoryCard: {},
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  mainChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '100%',
  },
  customMainInputChip: {
    borderRadius: 12,
    minWidth: 160,
    flexGrow: 1,
  },
  subcategorySection: {
    marginTop: 12,
    marginBottom: 4,
  },
  subcategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  subcategoryChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subcategoryInputChip: {
    borderRadius: 12,
  },
  showAllCategoriesBtn: {
    marginTop: 8,
    marginBottom: 4,
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
  },
});
